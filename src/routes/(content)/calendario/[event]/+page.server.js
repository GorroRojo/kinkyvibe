import { fail } from '@sveltejs/kit';
import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { getDB, logDBError } from '$lib/server/db';
import {
	VISITOR_COOKIE,
	checkInterestRateLimit,
	getInterest,
	hashVisitor,
	isValidEventSlug,
	isValidVisitorId,
	setInterest
} from '$lib/server/db/interest.js';
import { getTicketsView, summarizeTickets } from '$lib/server/tickets/checkout.js';

const eventFiles = import.meta.glob('/src/lib/posts/calendario/*.md');

/**
 * Solo aceptamos interés para eventos publicados que existen en el repo.
 *
 * @param {string} slug
 */
async function isPublishedEvent(slug) {
	if (!isValidEventSlug(slug) || slug.startsWith('_')) return false;
	const importer = eventFiles[`/src/lib/posts/calendario/${slug}.md`];
	if (!importer) return false;
	const mod = /** @type {{ metadata?: { force_unpublished?: boolean } }} */ (await importer());
	return !mod.metadata?.force_unpublished;
}

/** @param {import('@sveltejs/kit').Cookies} cookies */
function readVisitorId(cookies) {
	const id = cookies.get(VISITOR_COOKIE);
	return isValidVisitorId(id) ? /** @type {string} */ (id) : null;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, cookies, fetch }) {
	const [related, interest, tickets] = await Promise.all([
		loadRelated(params.event),
		loadInterest(params.event, platform, cookies),
		loadTickets(params.event, platform, fetch)
	]);
	return { ...related, interest, tickets };
}

/**
 * Solo el resumen para el botón "Comprar entradas" (el formulario está en /entradas); `null` si
 * el evento no vende entradas.
 * @param {string} slug
 * @param {App.Platform|undefined} platform
 * @param {typeof fetch} fetchFn
 */
async function loadTickets(slug, platform, fetchFn) {
	if (!isValidEventSlug(slug)) return null;
	const view = await getTicketsView(getDB(platform), slug, fetchFn);
	return view ? summarizeTickets(view) : null;
}

/** Related posts, computed on the server so the page doesn't need every post.
 * @param {string} slug */
async function loadRelated(slug) {
	let post;
	try {
		post = await fetchPost('calendario', slug, true);
	} catch (e) {
		// missing/unpublished posts are handled by +page.js
		return { relatedPosts: [], relatedPastCount: 0 };
	}
	return currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts()));
}

/**
 * "Me interesa" count for this event; `null` hides the button (no DB binding or DB error).
 * @param {string} slug
 * @param {App.Platform|undefined} platform
 * @param {import('@sveltejs/kit').Cookies} cookies
 */
async function loadInterest(slug, platform, cookies) {
	const db = getDB(platform);
	if (!db || !isValidEventSlug(slug)) return null;
	try {
		const visitorId = readVisitorId(cookies);
		const visitorHash = visitorId
			? await hashVisitor(slug, visitorId, platform?.env?.INTEREST_SALT)
			: null;
		return await getInterest(db, slug, visitorHash);
	} catch (error) {
		logDBError('load interest', error);
		return null;
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	interest: async ({ params, platform, cookies, request }) => {
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'Esta función no está disponible ahora.' });
		if (!(await isPublishedEvent(params.event))) {
			return fail(404, { error: 'Ese evento no existe.' });
		}

		const form = await request.formData();
		const interested = form.get('interested') === '1';

		let visitorId = readVisitorId(cookies);
		if (!visitorId) {
			visitorId = crypto.randomUUID();
			cookies.set(VISITOR_COOKIE, visitorId, {
				path: '/calendario',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 365
			});
		}

		try {
			const visitorHash = await hashVisitor(params.event, visitorId, platform?.env?.INTEREST_SALT);
			const limit = await checkInterestRateLimit(db, params.event, visitorHash);
			if (!limit.allowed) {
				return fail(429, {
					error: 'Demasiados intentos seguidos. Probá de nuevo en un ratito.',
					retryAfter: limit.retryAfter
				});
			}
			return { interest: await setInterest(db, params.event, visitorHash, interested) };
		} catch (error) {
			logDBError('set interest', error);
			return fail(500, { error: 'No pudimos guardar tu interés. Probá de nuevo más tarde.' });
		}
	}
};

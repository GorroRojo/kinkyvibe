import { fail } from '@sveltejs/kit';
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
import { buyAction, discountAction, getTicketsView } from '$lib/server/tickets/checkout.js';

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
export async function load({ params, platform, cookies }) {
	const db = getDB(platform);
	/** @type {import('$lib/server/tickets/checkout.js').TicketsView | null} */
	const tickets = isValidEventSlug(params.event) ? await getTicketsView(db, params.event) : null;
	if (!db || !isValidEventSlug(params.event)) return { interest: null, tickets };
	try {
		const visitorId = readVisitorId(cookies);
		const visitorHash = visitorId
			? await hashVisitor(params.event, visitorId, platform?.env?.INTEREST_SALT)
			: null;
		return { interest: await getInterest(db, params.event, visitorHash), tickets };
	} catch (error) {
		logDBError('load interest', error);
		return { interest: null, tickets };
	}
}

/** @type {import('./$types').Actions} */
export const actions = {
	// Compra de entradas (solo eventos con `tickets` en el frontmatter).
	buy: (event) => buyAction(event),
	discount: (event) => discountAction(event),
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

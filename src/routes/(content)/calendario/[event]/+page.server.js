import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { getTicketsView, summarizeTickets } from '$lib/server/tickets/checkout.js';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { perfilesPublicosEnabled } from '$lib/server/flags.js';
import { publicVenueForEvent } from '$lib/server/amigues/venues.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, fetch, locals }) {
	const [related, tickets, venue] = await Promise.all([
		loadRelated(params.event),
		loadTickets(params.event, platform, fetch),
		loadVenue(params.event, platform, locals)
	]);
	return { ...related, tickets, venue };
}

/**
 * "Sucede en": el lugar del evento según su privacidad (docs/amigues.md), solo con el interruptor
 * `perfiles_publicos` prendido. `null` si no tiene lugar: la página muestra lo de su .md.
 * @param {string} slug
 * @param {App.Platform|undefined} platform
 * @param {App.Locals} locals
 */
async function loadVenue(slug, platform, locals) {
	const db = getDB(platform);
	if (!db || !(await perfilesPublicosEnabled(platform))) return null;
	try {
		return await publicVenueForEvent(db, slug, viewerFor(locals));
	} catch (e) {
		console.error('[calendario] no se pudo leer el lugar del evento', e);
		return null;
	}
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

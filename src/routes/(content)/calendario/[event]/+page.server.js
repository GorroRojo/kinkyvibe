import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { getTicketsView, summarizeTickets } from '$lib/server/tickets/checkout.js';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { perfilesPublicosEnabled, propinasEnabled, seriesEnabled } from '$lib/server/flags.js';
import { publicVenueForEvent } from '$lib/server/amigues/venues.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { personasForPage } from '$lib/server/personas/index.js';
import { eventSeries } from '$lib/server/series/index.js';
import { seriesAccountState } from '$lib/server/series/web.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, fetch, locals }) {
	const post = await fetchPost('calendario', params.event, true).catch(() => null);
	const [related, tickets, propinas, venue, personas, series] = await Promise.all([
		loadRelated(post),
		loadTickets(params.event, platform, fetch),
		// Interruptor `propinas`: bloque de propina en lugar de la nota del cafecito (la página
		// solo lo muestra en los eventos de KinkyVibe).
		propinasEnabled(platform),
		loadVenue(params.event, platform, locals),
		loadPersonas(post, platform),
		loadSeries(post, platform, locals)
	]);
	return { ...related, tickets, propinas, venue, personas, series };
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

/**
 * Personas con su rol (interruptor `personas_eventos`; apagado, `null` y la página queda igual).
 * @param {ProcessedPost|null} post null if missing/unpublished (handled by +page.js)
 * @param {App.Platform|undefined} platform
 */
async function loadPersonas(post, platform) {
	if (!post) return null;
	return personasForPage(platform, post.meta);
}

/** Related posts, computed on the server so the page doesn't need every post.
 * @param {ProcessedPost|null} post null if missing/unpublished (handled by +page.js) */
async function loadRelated(post) {
	if (!post) return { relatedPosts: [], relatedPastCount: 0 };
	return currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts()));
}

/**
 * Interruptor `series`: las series del evento ("Edición N de…", anterior/siguiente, "Avisame si
 * se repite"). Apagado, `null` y la página queda como siempre.
 * @param {ProcessedPost|null} post
 * @param {App.Platform|undefined} platform
 * @param {App.Locals} locals
 */
async function loadSeries(post, platform, locals) {
	if (!post || !(await seriesEnabled(platform))) return null;
	const { postID: slug, tags, start } = post.meta;
	const list = await eventSeries({ slug, tags, start });
	if (!list.length) return null;
	return { list, account: await seriesAccountState(platform, locals) };
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

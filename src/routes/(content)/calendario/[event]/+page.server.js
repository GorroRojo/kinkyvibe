import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { getTicketsView, summarizeTickets } from '$lib/server/tickets/checkout.js';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { propinasEnabled, seriesEnabled } from '$lib/server/flags.js';
import { eventSeries } from '$lib/server/series/index.js';
import { seriesAccountState } from '$lib/server/series/web.js';
import { eventPageVenue, relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { personasForPage } from '$lib/server/personas/index.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, fetch, locals }) {
	const post = await fetchPost('calendario', params.event, true).catch(() => null);
	const [related, tickets, series, venue, personas, propinas] = await Promise.all([
		loadRelated(post, platform),
		loadTickets(params.event, platform, fetch),
		loadSeries(post, platform, locals),
		// "Sucede en": el lugar según su privacidad (docs/amigues.md); `null` si no tiene lugar.
		eventPageVenue(getDB(platform), params.event, locals),
		loadPersonas(post, platform),
		// Interruptor `propinas`: bloque de propina en lugar de la nota del cafecito (la página
		// solo lo muestra en los eventos de KinkyVibe).
		propinasEnabled(platform)
	]);
	return { ...related, tickets, series, venue, personas, propinas };
}

/**
 * Personas con su rol (interruptor `personas_eventos`; apagado, `null` y la página queda igual).
 * @param {ProcessedPost|null} post null if missing/unpublished (handled by +page.js)
 * @param {App.Platform|undefined} platform
 */
async function loadPersonas(post, platform) {
	if (!post) return null;
	try {
		return await personasForPage(platform, post.meta);
	} catch (e) {
		return null;
	}
}

/** Related posts, computed on the server so the page doesn't need every post.
 * Un lugar vinculado manda sobre el «Dónde» del .md de cada uno.
 * @param {ProcessedPost|null} post null if missing/unpublished (handled by +page.js)
 * @param {App.Platform|undefined} platform */
async function loadRelated(post, platform) {
	if (!post) return { relatedPosts: [], relatedPastCount: 0 };
	return relatedWithVenuePlaces(
		getDB(platform),
		currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts()))
	);
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
	const list = await eventSeries({ slug, tags, start }, { tags: await siteTagManager(platform) });
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

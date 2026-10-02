import { error } from '@sveltejs/kit';
import { currentRelated, fetchPost, relatedPostsFor } from '$lib/utils';
import { siteEvent, sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { getTicketsView, summarizeTickets } from '$lib/server/tickets/checkout.js';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { propinasEnabled, seriesEnabled } from '$lib/server/flags.js';
import { eventSeries } from '$lib/server/series/index.js';
import { seriesAccountState } from '$lib/server/series/web.js';
import { eventPageVenue, relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { stripMdPlace } from '$lib/utils/eventPlace.js';
import { personasForPage } from '$lib/server/personas/index.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, fetch, locals, setHeaders }) {
	// Interruptor `contenido_db`: el evento de la base (con su texto ya armado). Si la base no tiene
	// esa dirección, el .md como siempre (+page.js carga su componente).
	// La lista de publicaciones (para relacionados y series) se lee a la par del evento.
	const [found, posts] = await Promise.all([
		siteEvent(platform, params.event, { viewer: viewerFor(locals) }),
		sitePosts(platform)
	]);
	if (found.mode === 'db' && !found.post) error(404, 'Not found');
	const db = found.mode === 'db' ? found.post : null;
	// Un evento oculto solo lo ven les admins: que no quede en ninguna caché compartida.
	if (db?.meta.force_unpublished) setHeaders({ 'cache-control': 'private, no-store' });
	const post = db ?? (await fetchPost('calendario', params.event, true).catch(() => null));
	const [related, tickets, series, venue, personas, propinas] = await Promise.all([
		loadRelated(post, posts, platform),
		loadTickets(params.event, platform, fetch),
		loadSeries(post, platform, locals, posts),
		// "Sucede en": el lugar según su privacidad (docs/amigues.md); `null` si no tiene lugar.
		eventPageVenue(getDB(platform), params.event, locals),
		loadPersonas(post, platform),
		// Interruptor `propinas`: bloque de propina en lugar de la nota del cafecito (la página
		// solo lo muestra en los eventos de KinkyVibe).
		propinasEnabled(platform)
	]);
	return {
		...related,
		tickets,
		series,
		venue,
		personas,
		propinas,
		// Con lugar, el «Dónde» del evento de la base no sale del servidor (como +page.js con el .md).
		...(db
			? {
					mode: /** @type {const} */ ('db'),
					post: venue ? { ...db, meta: stripMdPlace(db.meta) } : db
				}
			: { mode: /** @type {const} */ ('md') })
	};
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

/** Related posts, computed on the server so the page doesn't need every post, with the ticket
 * sales state of the related events for their cards (one batched query, see listStates.js).
 * Un lugar vinculado manda sobre el «Dónde» del .md de cada uno.
 * @param {ProcessedPost|null} post null if missing/unpublished (handled by +page.js)
 * @param {ProcessedPost[]} posts
 * @param {App.Platform|undefined} platform */
async function loadRelated(post, posts, platform) {
	if (!post) return { relatedPosts: [], relatedPastCount: 0, ticketStates: null };
	const related = await relatedWithVenuePlaces(
		getDB(platform),
		currentRelated(relatedPostsFor(post.meta, posts))
	);
	return { ...related, ticketStates: await ticketStatesFor(platform, related.relatedPosts) };
}

/**
 * Interruptor `series`: las series del evento ("Edición N de…", anterior/siguiente, "Avisame si
 * se repite"). Apagado, `null` y la página queda como siempre.
 * @param {ProcessedPost|null} post
 * @param {App.Platform|undefined} platform
 * @param {App.Locals} locals
 * @param {ProcessedPost[]} posts
 */
async function loadSeries(post, platform, locals, posts) {
	if (!post || !(await seriesEnabled(platform))) return null;
	const { postID: slug, tags, start } = post.meta;
	const list = await eventSeries(
		{ slug, tags, start },
		{ tags: await siteTagManager(platform), posts }
	);
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

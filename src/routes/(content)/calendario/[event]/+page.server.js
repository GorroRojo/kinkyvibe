import { error } from '@sveltejs/kit';
import { currentRelated, relatedPostsFor } from '$lib/utils';
import { siteEvent, sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { getTicketsView, summarizeTickets } from '$lib/server/tickets/checkout.js';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { propinasEnabled } from '$lib/server/flags.js';
import { eventSeries } from '$lib/server/series/index.js';
import { seriesAccountState } from '$lib/server/series/web.js';
import { eventPageVenue, relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { stripMdPlace } from '$lib/utils/eventPlace.js';
import { personasForPage } from '$lib/server/personas/index.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { readWorkshop } from '$lib/server/eventos/partes.js';
import { coveringTicketSlug, partOf } from '$lib/utils/partes.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, fetch, locals, setHeaders }) {
	// El evento de la base (con su texto ya armado); si la base no lo tiene, o quien mira no lo
	// puede ver, 404. La lista de publicaciones (para relacionados y series) se lee a la par.
	const [post, posts] = await Promise.all([
		siteEvent(platform, params.event, { viewer: viewerFor(locals) }),
		sitePosts(platform)
	]);
	if (!post) error(404, 'Not found');
	// Un evento oculto solo lo ven les admins: que no quede en ninguna caché compartida.
	if (post.meta.force_unpublished) setHeaders({ 'cache-control': 'private, no-store' });
	const [related, ownTickets, series, venue, personas, propinas, partes] = await Promise.all([
		loadRelated(post, posts, platform),
		loadTickets(params.event, platform, fetch),
		loadSeries(post, platform, locals, posts),
		// "Sucede en": el lugar según su privacidad (docs/amigues.md); `null` si no tiene lugar.
		eventPageVenue(getDB(platform), params.event, locals),
		loadPersonas(post, platform),
		// Interruptor `propinas`: bloque de propina en lugar de la nota del cafecito (la página
		// solo lo muestra en los eventos de KinkyVibe).
		propinasEnabled(platform),
		// Talleres en varias partes: el taller y sus partes (`null` si no es parte de ninguno).
		loadPartes(params.event, platform, locals)
	]);
	// Una parte de un taller con una sola entrada: el botón de compra es el del taller.
	const tickets = partes?.ticketSlug
		? await loadTickets(partes.ticketSlug, platform, fetch)
		: ownTickets;
	return {
		...related,
		tickets: tickets ? { ...tickets, slug: partes?.ticketSlug ?? params.event } : null,
		partes,
		series,
		venue,
		personas,
		propinas,
		// Con lugar, el «Dónde» del evento no sale del servidor.
		post: venue ? { ...post, meta: stripMdPlace(post.meta) } : post
	};
}

/**
 * Personas con su rol (interruptor `personas_eventos`; apagado, `null` y la página queda igual).
 * @param {ProcessedPost} post
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
 * @param {ProcessedPost} post
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
 * Las series del evento ("Edición N de…", anterior/siguiente, "Avisame si se repite"); `null` si
 * no es parte de ninguna.
 * @param {ProcessedPost|null} post
 * @param {App.Platform|undefined} platform
 * @param {App.Locals} locals
 * @param {ProcessedPost[]} posts
 */
async function loadSeries(post, platform, locals, posts) {
	if (!post) return null;
	const { postID: slug, tags, start } = post.meta;
	const list = await eventSeries(
		{ slug, tags, start },
		{ tags: await siteTagManager(platform), posts }
	);
	if (!list.length) return null;
	return { list, account: await seriesAccountState(platform, locals) };
}

/**
 * Talleres en varias partes (docs/talleres-partes.md): el taller, todas sus partes (las que quien
 * mira puede ver) y cuál es este evento; `ticketSlug`: de qué evento es la entrada si es una parte
 * de un taller con una sola entrada. `null` si no es parte de ningún taller.
 * @param {string} slug
 * @param {App.Platform|undefined} platform
 * @param {App.Locals} locals
 */
async function loadPartes(slug, platform, locals) {
	try {
		const ws = await readWorkshop(getDB(platform), slug, viewerFor(locals));
		const current = partOf(ws, slug);
		if (!ws || !current) return null;
		return {
			total: ws.total,
			current: current.n,
			perPart: ws.workshop.perPart,
			workshop: { slug: ws.workshop.slug, title: ws.workshop.title },
			parts: ws.parts.map((p) => ({
				slug: p.slug,
				title: p.title,
				n: p.n,
				start: p.start,
				status: p.status
			})),
			ticketSlug: coveringTicketSlug(ws, slug)
		};
	} catch (e) {
		console.error('[partes] no se pudieron leer las partes del taller:', e);
		return null;
	}
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

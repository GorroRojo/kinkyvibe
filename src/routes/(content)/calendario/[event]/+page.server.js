import { error } from '@sveltejs/kit';
import { currentRelated, relatedPostsFor } from '$lib/utils';
import { peekSitePost, siteEvent, sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import {
	getTicketsView,
	prefetchTicketsView,
	summarizeTickets
} from '$lib/server/tickets/checkout.js';
import { getEventTickets, isValidEventSlug } from '$lib/server/tickets/events.js';
import { waitlistJoinStates } from '$lib/server/tickets/waitlistSignup.js';
import { listaEsperaEnabled } from '$lib/server/flags.js';
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
import { mentionPronouns } from '$lib/server/pronouns';
import { hasOwnTickets } from '$lib/utils/ticketCta.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, fetch, locals, setHeaders }) {
	// Lo que no depende del evento ya leído sale a la par de su lectura: la base está lejos y cada
	// consulta que espera a otra es una ida y vuelta más. Nada de esto se muestra hasta saber que
	// quien mira puede ver el evento (si no, 404 y se descarta).
	const waitlistOn = listaEsperaEnabled(platform);
	// El momento de la venta: el mismo para lo adelantado (`askEarly`) y para la lectura de verdad.
	const now = Date.now();
	askEarly(params.event, platform, locals, waitlistOn, now);
	const early = {
		ownTickets: loadTickets(params.event, platform, fetch, waitlistOn, now),
		// "Sucede en": el lugar según su privacidad (docs/amigues.md); `null` si no tiene lugar.
		venue: eventPageVenue(getDB(platform), params.event, locals),
		// Talleres en varias partes: el taller y sus partes (`null` si no es parte de ninguno).
		partes: loadPartes(params.event, platform, locals)
	};
	// Una parte de un taller con una sola entrada: el botón de compra es el del taller (si la
	// entrada es la de este mismo evento, ya está en camino).
	const partTickets = early.partes.then((partes) =>
		partes?.ticketSlug && partes.ticketSlug !== params.event
			? loadTickets(partes.ticketSlug, platform, fetch, waitlistOn, now)
			: undefined
	);
	// Con un 404 (o si falla la lectura del evento) nadie las espera: que un error suyo no quede
	// sin atender. Más abajo se esperan las originales, que siguen tirando como antes.
	for (const p of [waitlistOn, partTickets, ...Object.values(early)]) p.catch(() => {});
	// El evento de la base (con su texto ya armado); si la base no lo tiene, o quien mira no lo
	// puede ver, 404. La lista de publicaciones (para relacionados y series) se lee a la par.
	const [post, posts] = await Promise.all([
		siteEvent(platform, params.event, { viewer: viewerFor(locals) }),
		sitePosts(platform)
	]);
	if (!post) error(404, 'Not found');
	// Un evento oculto solo lo ven les admins: que no quede en ninguna caché compartida.
	if (post.meta.force_unpublished) setHeaders({ 'cache-control': 'private, no-store' });
	const [related, ownTickets, series, venue, personas, partes, pronouns, workshopTickets] =
		await Promise.all([
			loadRelated(post, posts, platform),
			early.ownTickets,
			loadSeries(post, platform, locals, posts),
			early.venue,
			loadPersonas(post, platform),
			early.partes,
			// Los pronombres de las @menciones del texto (de los perfiles de la base).
			mentionPronouns(platform, posts).catch(() => ({})),
			partTickets
		]);
	const tickets = workshopTickets === undefined ? ownTickets : workshopTickets;
	return {
		...related,
		tickets: tickets ? { ...tickets, slug: partes?.ticketSlug ?? params.event } : null,
		partes,
		series,
		venue,
		personas,
		pronouns,
		// Con lugar, el «Dónde» del evento no sale del servidor.
		post: venue ? { ...post, meta: stripMdPlace(post.meta) } : post
	};
}

/**
 * Lo que la página pregunta después de leer el evento y la lista, adelantado con lo que ya sabe
 * este isolate del evento (las listas armadas la última vez, `peekSitePost`): los lugares de los
 * relacionados, las personas y, si vende entradas, lo que lee la venta. Son las mismas consultas
 * que salen después; con las tandas automáticas (src/lib/server/db/autoBatch.js) van en la misma
 * ida que la lectura del evento, y las de después reciben lo ya leído. Si el evento cambió y la
 * pregunta de verdad es otra, sale aparte, como siempre: esto nunca decide qué se muestra. Sin
 * sesión solamente (con sesión, quien mira cambia las respuestas).
 * @param {string} slug
 * @param {App.Platform | undefined} platform
 * @param {App.Locals} locals
 * @param {Promise<boolean>} waitlistOn
 * @param {number} now
 */
function askEarly(slug, platform, locals, waitlistOn, now) {
	const db = getDB(platform);
	if (!db || locals.user || locals.member) return;
	const guess = peekSitePost('calendario', slug);
	if (!guess) return;
	const meta = guess.post.meta;
	const quiet = (/** @type {Promise<unknown>} */ p) => p.catch(() => {});
	quiet(relatedWithVenuePlaces(db, currentRelated(relatedPostsFor(meta, guess.posts))));
	quiet(personasForPage(platform, meta));
	if (hasOwnTickets(meta) && isValidEventSlug(slug))
		prefetchTicketsView(db, slug, now, { waitlist: waitlistOn });
}

/**
 * Personas con su rol (`null` si no hay nada que mostrar: la página queda igual).
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
 * @param {Promise<boolean>} waitlistFlag el interruptor de la lista de espera (`listaEsperaEnabled`)
 * @param {number} now el momento de la venta
 */
async function loadTickets(slug, platform, fetchFn, waitlistFlag, now) {
	if (!isValidEventSlug(slug)) return null;
	// Lista de espera: con el interruptor prendido, lo que sobra después de la fila (como /entradas).
	const db = getDB(platform);
	const waitlistOn = await waitlistFlag;
	// El precio solo se muestra (se cobra en /entradas): el porcentaje del Fondo conocido, sin
	// esperar a fondo.kinkyvibe.ar; se actualiza en segundo plano (tickets/fondo.js).
	const ctx = platform?.ctx;
	const view = await getTicketsView(db, slug, fetchFn, {
		now,
		waitlist: waitlistOn,
		fondo: ctx?.waitUntil ? { staleOk: true, waitUntil: (task) => ctx.waitUntil(task) } : {}
	});
	if (!view) return null;
	const summary = summarizeTickets(view);
	// Agotadas con lista: el botón lleva al formulario de la página de compra («Agotadas · Anotate
	// en la lista de espera»). Solo se suma `waitlist` cuando hay dónde anotarse (la misma cuenta
	// que el formulario de /entradas); si no, el resumen queda como siempre.
	if (waitlistOn && db && !view.open && (await canJoinWaitlist(db, slug)))
		return { ...summary, waitlist: true };
	return summary;
}

/**
 * ¿Hay algún alcance agotado de la lista de espera donde anotarse? Como el formulario de
 * /entradas (`waitlistView`): si algo falla, no (la página del evento nunca se rompe por la lista).
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 */
async function canJoinWaitlist(db, slug) {
	try {
		const config = await getEventTickets(slug);
		if (!config?.waitlist) return false;
		return (await waitlistJoinStates(db, slug, config)).some((s) => s.state === 'open');
	} catch (e) {
		console.error('[lista de espera] no se pudo ver si hay dónde anotarse:', e);
		return false;
	}
}

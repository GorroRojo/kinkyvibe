/**
 * Página de compra de entradas de un evento: /calendario/<slug>/entradas. Está separada de la
 * página del evento para que el formulario no empuje hacia abajo el texto del evento; la página
 * del evento muestra un botón "Comprar entradas" que trae acá.
 *
 * Los precios, cupos y medios de pago salen del servidor (`getTicketsView`, frontmatter + D1) y
 * las form actions vuelven a validar todo (ver $lib/server/tickets/checkout.js).
 *
 * Lista de espera (interruptor `lista_espera`, docs/tickets.md): con un alcance agotado, la
 * página muestra «Anotate en la lista de espera» y `?/waitlist` anota el mail
 * ($lib/server/tickets/waitlistSignup.js). Lo que se puede comprar es lo que sobra después de la
 * fila. Con el link de una oferta (`?lista=<token>`, del mail «Se liberó un lugar»), la página
 * muestra hasta cuándo le guardamos el lugar y lo que puede comprar esa persona, y el formulario
 * lleva el token en un campo oculto (`buyAction` lo vuelve a mirar). Apagado, `?/waitlist` da
 * 404, `lista` no hace nada y no se ve nada.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { buyAction, discountAction, getTicketsView } from '$lib/server/tickets/checkout.js';
import { siteEvent } from '$lib/server/contenido/posts.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { eventPageVenue } from '$lib/server/amigues/venues.js';
import { stripMdPlace } from '$lib/utils/eventPlace.js';
import { purchaseAccount } from '$lib/server/cuentas/savedBuyer.js';
import { readWorkshop } from '$lib/server/eventos/partes.js';
import { coveringTicketSlug } from '$lib/utils/partes.js';
import { listaEsperaEnabled } from '$lib/server/flags.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { contactEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { clientAddress, clientHash } from '$lib/server/tickets/safeguards.js';
import { signUpForWaitlist, waitlistJoinStates } from '$lib/server/tickets/waitlistSignup.js';
import { findOffer } from '$lib/server/tickets/waitlistPurchase.js';
import { waitlistSender } from '$lib/server/tickets/waitlistMail.js';
import { queueWaitlistAdvance } from '$lib/server/tickets/waitlistEngine.js';

/**
 * Talleres en varias partes (docs/talleres-partes.md): si el evento es una parte de un taller con
 * una sola entrada, la dirección de la compra del taller; si no, `null`.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 */
async function workshopTickets(platform, slug) {
	try {
		return coveringTicketSlug(await readWorkshop(getDB(platform), slug), slug);
	} catch (e) {
		console.error('[partes] no se pudieron leer las partes del taller:', e);
		return null;
	}
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, fetch, locals, setHeaders, url }) {
	if (!isValidEventSlug(params.event)) error(404, 'Ese evento no existe.');
	const db = getDB(platform);
	// La base está lejos: lo que no depende de otra cosa se lee a la par. Primero el evento (el
	// encabezado sale del evento de la base; si no lo tiene, 404), si es una parte de un taller y
	// el interruptor de la lista de espera.
	const [found, host, waitlistOn] = await Promise.all([
		siteEvent(platform, params.event, { viewer: viewerFor(locals), shallow: true, html: false }),
		workshopTickets(platform, params.event),
		db ? listaEsperaEnabled(platform) : false
	]);
	// En este orden: una parte que no se ve da 404 sin contar de qué taller es.
	if (!found) error(404, 'Ese evento no existe.');
	// Una parte de un taller con una sola entrada no vende: la entrada se compra en el taller.
	if (host) redirect(307, `/calendario/${host}/entradas`);
	// Las reservas de MP (20 min) y de transferencia vencen sin aviso: si hay gente en la lista,
	// un empujón en segundo plano (como mucho uno por minuto) le pasa el lugar a quien sigue.
	if (waitlistOn)
		queueWaitlistAdvance({ platform, db, eventSlug: params.event, fetch, origin: siteOrigin(url) });
	const offer =
		waitlistOn && db ? await offerView(db, params.event, url.searchParams.get('lista')) : null;
	// La configuración de las entradas (getTicketsView), el lugar y, con cuenta, los datos
	// guardados, a la par.
	const [tickets, venue, accountRead] = await Promise.all([
		getTicketsView(db, params.event, fetch, {
			waitlist: waitlistOn,
			offerId: offer?.state === 'valid' ? offer.id : null
		}),
		// Como en la página del evento: si tiene lugar, manda sobre el «Dónde» del evento.
		eventPageVenue(db, params.event, locals),
		locals.member ? purchaseAccount(db, locals.member) : null
	]);
	// Un evento que no vende por acá (se inscribe en otro sitio, o todavía no abrió la venta): a la
	// página del evento, que tiene el link real. 302: puede empezar a vender más adelante.
	if (!tickets) redirect(302, found.path);
	const event = { meta: venue ? stripMdPlace(found.meta) : found.meta, path: found.path };
	// Con cuenta: nombre, pronombres, DNI guardados y el mail de la cuenta, para completar «Tus
	// datos», solo con la venta abierta. Es de esta persona: la página no se guarda en ningún caché.
	const account = tickets.open ? accountRead : null;
	// Quien tiene un lugar guardado ya está en la lista: no se le ofrece anotarse. Con la venta en
	// pausa (TICKETS_PAUSED), tampoco: la página muestra solo el texto de la pausa.
	const waitlist =
		tickets.open || tickets.reason === 'paused' || !waitlistOn || offer?.state === 'valid'
			? null
			: await waitlistView(platform, params.event, locals);
	// Con datos de la cuenta, el mail de la cuenta en el formulario o una oferta de la lista, la
	// página es de esta persona: no se guarda en ningún caché (una sola vez: SvelteKit no deja
	// poner el mismo encabezado dos veces).
	if (account || waitlist?.email || offer) setHeaders({ 'cache-control': 'private, no-store' });
	return {
		tickets,
		event,
		venue,
		account,
		waitlist,
		offer: offer && {
			state: offer.state,
			holdUntil: offer.state === 'valid' ? offer.holdUntil : null,
			// El token vuelve en el campo oculto del formulario solo si la oferta vale.
			token: offer.state === 'valid' ? offer.token : ''
		}
	};
}

/**
 * La oferta del link `?lista=<token>`, o `null` sin el parámetro. Si algo falla, `invalid` (la
 * página de compra nunca se rompe por la lista).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {string | null} token
 * @returns {Promise<(import('$lib/server/tickets/waitlistPurchase.js').OfferLookup
 *   & { token: string }) | null>}
 */
async function offerView(db, slug, token) {
	if (token === null) return null;
	try {
		return { ...(await findOffer(db, { token, eventSlug: slug, now: Date.now() })), token };
	} catch (e) {
		console.error('[lista de espera] no se pudo leer la oferta:', e);
		return { state: 'invalid', token };
	}
}

/**
 * Lo que necesita el formulario de la lista de espera: los alcances agotados donde se puede
 * anotar (con el interruptor prendido y el evento con lista), o `null`. Si algo falla, `null`:
 * la página de compra nunca se rompe por la lista.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} slug
 * @param {App.Locals} locals
 * @returns {Promise<{ scope: 'event' | 'type', types: { id: string, name: string }[],
 *   email: string } | null>}
 */
async function waitlistView(platform, slug, locals) {
	const db = getDB(platform);
	if (!db) return null;
	try {
		const config = await getEventTickets(slug);
		if (!config?.waitlist) return null;
		const open = (await waitlistJoinStates(db, slug, config)).filter((s) => s.state === 'open');
		if (!open.length) return null;
		return {
			scope: config.waitlist.scope,
			types: open.flatMap((s) => (s.ticketType ? [{ id: s.ticketType, name: s.name ?? '' }] : [])),
			email: locals.member?.email ?? ''
		};
	} catch (e) {
		console.error('[lista de espera] no se pudo armar el formulario:', e);
		return null;
	}
}

/** @param {FormData} form @param {string} key */
const field = (form, key) => {
	const v = form.get(key);
	return typeof v === 'string' ? v.slice(0, 300).trim() : '';
};

/** @type {import('./$types').Actions} */
export const actions = {
	buy: async (event) => {
		if (await workshopTickets(event.platform, event.params.event)) {
			return fail(409, {
				buy: {
					error: 'La entrada de esta parte se compra en la página del taller.',
					errors: {},
					values: {},
					discount: null
				}
			});
		}
		return buyAction(event);
	},
	discount: (event) => discountAction(event),
	// Anotarse en la lista de espera (solo el mail; con cuenta y ese mail, directo a la fila).
	waitlist: async (event) => {
		const { params, platform, request, locals, url, fetch } = event;
		if (!(await listaEsperaEnabled(platform))) error(404, 'No encontrado.');
		const form = await request.formData();
		const email = field(form, 'email');
		const tipo = field(form, 'tipo');
		/** @param {number} status @param {string} message */
		const failWith = (status, message) =>
			fail(status, { waitlist: { error: message, email, tipo } });
		const db = getDB(platform);
		if (!db) return failWith(503, 'La lista de espera no está disponible ahora.');
		const config = await getEventTickets(params.event);
		if (!config) error(404, 'Este evento no vende entradas por acá.');
		// DEV ONLY: las pruebas E2E se anotan siempre desde la misma conexión (localhost), como en
		// la compra (TICKETS_DEV_RELAX_LIMITS): sin el límite por conexión.
		const relaxed = dev && env.TICKETS_DEV_RELAX_LIMITS === '1';
		const client = relaxed ? `dev-${crypto.randomUUID()}` : await clientHash(clientAddress(event));
		const r = await signUpForWaitlist({
			db,
			eventSlug: params.event,
			config,
			ticketType: tipo,
			email,
			member: locals.member ?? null,
			client,
			send: waitlistSender(db, fetch),
			origin: siteOrigin(url),
			contactEmail: contactEmail()
		});
		if (!r.ok) return failWith(r.status, r.message);
		return { waitlist: { ok: true, status: r.status, tipo } };
	}
};

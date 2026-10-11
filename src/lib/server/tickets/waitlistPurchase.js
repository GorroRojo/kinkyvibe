/**
 * La lista de espera en la compra (docs/tickets.md, «Lista de espera»). Detrás del interruptor
 * `lista_espera`: con el interruptor apagado (o el evento sin lista) nada de esto se usa y la
 * venta anda como siempre.
 *
 * - Cada persona que espera (y cada una con un lugar guardado vigente) guarda un lugar: el
 *   público solo puede comprar lo que sobra después de la fila. Por evento, la fila se compara
 *   contra el lugar libre TOTAL del evento (respuesta 2 de gorrite); por tipo, contra el de ese
 *   tipo. Es la misma cuenta que `waitlistJoinStates` (waitlistSignup.js), así «se puede comprar»
 *   y «se puede anotar» nunca dicen las dos cosas a la vez.
 * - Quien tiene un lugar guardado entra con el link del mail (`?lista=<token>`): puede comprar
 *   todo lo que esté libre menos lo guardado para otras personas con oferta vigente.
 * - El control de verdad va en la misma sentencia que crea la orden (`reserveOrder`, parámetro
 *   `waitlist` = {@link waitlistGuard}): dos compras a la vez no pueden pasarse ni usar dos veces
 *   el mismo link. Lo de acá sirve para armarlo y para lo que muestra la página.
 * - Una reserva vencida (`hold_until <= now`) deja de guardar lugar en el acto, sin esperar al
 *   cron (como `expires_at` en las órdenes). El aviso a toda la lista (`hold_until` NULL) no
 *   guarda nada: compite con el público.
 * - La puerta, la carga a mano y la confirmación de transferencias no miran la lista.
 */
import { sha256Hex } from '$lib/server/hash.js';
import { typeAvailability } from './config.js';
import { waitlistHolders } from './waitlistSignup.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./config.js').EventTickets} EventTickets */
/** @typedef {import('./config.js').TicketType} TicketType */
/** @typedef {import('$lib/utils/ticketTiers.js').TakenCounts} TakenCounts */

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const WAITLIST_BUY_MESSAGES = Object.freeze({
	blocked:
		'Por ahora los lugares que se liberan son para la lista de espera. Anotate y te avisamos.',
	offerGone:
		'El link de la lista de espera ya no vale: venció tu reserva, ya lo usaste o se cerró la lista.',
	soldAtDoor:
		'Justo se vendió el lugar que te guardábamos (por ejemplo, en la puerta). Tu reserva sigue hasta que venza: si se libera otro lugar, lo podés comprar con este mismo link.'
});

/**
 * «Solo quedan N a la venta»: el resto está guardado para la lista.
 * @param {number} n
 */
export function waitlistShareMessage(n) {
	const what = n === 1 ? 'Solo queda 1 entrada' : `Solo quedan ${n} entradas`;
	return `${what} a la venta: el resto está guardado para la lista de espera.`;
}

/**
 * Tu lugar guardado es para otro tipo de entrada (lista por tipo).
 * @param {string} name
 */
export function offerTypeMessage(name) {
	return `Tu lugar guardado es para «${name}»: elegí ese tipo de entrada.`;
}

/**
 * @typedef {{ state: 'valid', id: string, ticketType: string | null, holdUntil: number | null }
 *   | { state: 'used' } | { state: 'invalid' }} OfferLookup
 * - `valid`: oferta vigente (`holdUntil` null = aviso a toda la lista, sin lugar guardado).
 * - `used`: ya compró con ese link.
 * - `invalid`: el link no existe, es de otro evento, venció o terminó.
 */

/**
 * Busca la oferta de un link `?lista=<token>` para este evento.
 *
 * @param {D1Database} db
 * @param {{ token: unknown, eventSlug: string, now: number }} input
 * @returns {Promise<OfferLookup>}
 */
export async function findOffer(db, { token, eventSlug, now }) {
	if (typeof token !== 'string' || !TOKEN_RE.test(token)) return { state: 'invalid' };
	const row = await db
		.prepare(
			`SELECT id, ticket_type, status, hold_until FROM waitlist_entries
			WHERE offer_token_hash = ?1 AND event_slug = ?2`
		)
		.bind(await sha256Hex(token), eventSlug)
		.first();
	if (!row) return { state: 'invalid' };
	if (row.status === 'purchased') return { state: 'used' };
	const holdUntil = row.hold_until == null ? null : Number(row.hold_until);
	if (row.status !== 'offered' || (holdUntil !== null && holdUntil <= now))
		return { state: 'invalid' };
	return {
		state: 'valid',
		id: String(row.id),
		ticketType: row.ticket_type == null ? null : String(row.ticket_type),
		holdUntil
	};
}

/**
 * Cuántos lugares guarda la fila en cada alcance del evento (clave '' = todo el evento), visto
 * por quien compra:
 * - sin oferta (público): las personas que esperan y las que tienen un lugar guardado vigente
 *   (`waitlistHolders`);
 * - con su oferta (`entryId`): solo los lugares guardados vigentes de OTRAS personas.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} now
 * @param {string | null} [entryId]
 * @returns {Promise<Map<string, number>>}
 */
export async function queueHolders(db, eventSlug, now, entryId = null) {
	if (!entryId) return waitlistHolders(db, eventSlug, now);
	const { results } = await db
		.prepare(
			`SELECT COALESCE(ticket_type, '') AS scope, COUNT(*) AS n FROM waitlist_entries
			WHERE event_slug = ?1 AND status = 'offered' AND hold_until > ?2 AND id <> ?3
			GROUP BY COALESCE(ticket_type, '')`
		)
		.bind(eventSlug, now, entryId)
		.all();
	return new Map(results.map((r) => [String(r.scope), Number(r.n)]));
}

/**
 * Lo que se puede comprar de cada tipo después de la fila. Solo trae los tipos a los que la fila
 * les cambia algo (los demás quedan como están):
 * - por evento: el lugar libre total (los tipos a la venta) menos la fila, y cada tipo acotado a
 *   eso. Con algún tipo a la venta sin límite, el evento no se agota y la fila no guarda nada;
 * - por tipo: lo de cada tipo con cupo, menos su fila.
 *
 * @param {EventTickets} config
 * @param {(type: TicketType) => { state: string, remaining: number | null }} availability
 *   `typeAvailability` de cada tipo, con lo tomado de ahora
 * @param {Map<string, number>} holders {@link queueHolders}
 * @returns {Map<string, number>}
 */
export function sharesAfterQueue(config, availability, holders) {
	/** @type {Map<string, number>} */
	const out = new Map();
	const list = config.waitlist;
	if (!list) return out;
	if (list.scope === 'event') {
		/** @type {[string, number][]} */
		const open = [];
		for (const t of config.types) {
			const a = availability(t);
			if (a.state !== 'open') continue;
			if (a.remaining === null) return out;
			open.push([t.id, a.remaining]);
		}
		const free = open.reduce((sum, [, r]) => sum + r, 0);
		const share = Math.max(0, free - (holders.get('') ?? 0));
		for (const [id, r] of open) out.set(id, Math.min(r, share));
		return out;
	}
	for (const t of config.types) {
		if (t.capacity === null || t.capacity === undefined) continue;
		const a = availability(t);
		if (a.state !== 'open' || a.remaining === null) continue;
		out.set(t.id, Math.max(0, a.remaining - (holders.get(t.id) ?? 0)));
	}
	return out;
}

/**
 * @typedef {{ scope: string, caps: Record<string, number>, entryId: string | null }} WaitlistGuard
 * Lo que `reserveOrder` necesita para controlar la fila en la misma sentencia que crea la orden:
 * - `scope`: '' (todo el evento) o el id del tipo (lista por tipo);
 * - `caps`: por cada tipo que cuenta para el lugar libre del alcance, hasta cuánto puede llegar
 *   lo tomado (lo tomado ahora + lo que queda). La sentencia vuelve a contar lo tomado en el
 *   momento: el lugar libre es la suma de `cap − tomado` (nunca menos de 0 por tipo);
 * - `entryId`: la anotación con la oferta de quien compra, o `null` (público).
 */

/**
 * Arma el control de la fila para una compra de `type`, o `null` si la fila no le cambia nada
 * (evento sin lista, un tipo sin cupo en la lista por tipo, un tipo sin límite a la venta en la
 * lista por evento, o un tipo que no está a la venta: eso lo frena otra regla).
 *
 * @param {EventTickets} config
 * @param {Pick<TicketType, 'id' | 'capacity'>} type el tipo que se compra
 * @param {TakenCounts} taken lo tomado de ahora (`getTaken`)
 * @param {number} now
 * @param {string | null} [entryId] la anotación de la oferta, si compra con el link
 * @returns {WaitlistGuard | null}
 */
export function waitlistGuard(config, type, taken, now, entryId = null) {
	const list = config.waitlist;
	if (!list) return null;
	const own = config.types.find((t) => t.id === type.id);
	if (!own) return null;
	if (list.scope === 'type' && (own.capacity === null || own.capacity === undefined)) return null;
	/** @type {Record<string, number>} */
	const caps = {};
	for (const t of list.scope === 'event' ? config.types : [own]) {
		const a = typeAvailability(config, t, taken, now);
		if (a.state !== 'open') continue;
		if (a.remaining === null) return null;
		caps[t.id] = (taken.types.get(t.id) ?? 0) + a.remaining;
	}
	if (!(own.id in caps)) return null;
	return { scope: list.scope === 'event' ? '' : own.id, caps, entryId };
}

/**
 * Qué muestra la tarjeta de un evento (PostListItem) en lugar del botón de inscripción cuando el
 * evento vende entradas acá (frontmatter `tickets`, compra en /calendario/<slug>/entradas).
 *
 * El estado de la venta lo calcula el servidor para todos los eventos de la lista juntos
 * (`ticketStatesFor` en $lib/server/tickets/listStates.js, con las mismas reglas que la página del
 * evento) y llega como un mapa slug → estado. Sin mapa (página prerenderizada, sin base), la
 * tarjeta muestra igual el link a /entradas: ahí se ve si quedan.
 */
import { argDayMonth } from './dates.js';
import { eventSeriesTags } from './series.js';

/**
 * Estado de la venta de un evento para las listas: lo mismo que `open`/`reason` del resumen de la
 * página del evento (`summarizeTickets`), más cuándo abre si todavía no abrió.
 *
 * @typedef {{
 *   open: boolean,
 *   reason: 'cancelled' | 'soldout' | 'closed' | 'notyet' | 'unavailable' | 'paused' | null,
 *   opensAt: number | null,
 *   waitlist?: boolean
 * }} ListTicketState
 * `waitlist`: agotadas y el evento tiene su lista de espera prendida (interruptor `lista_espera` y
 * `waitlist` del evento): la tarjeta lleva a anotarse (a la página del evento, `#entradas`).
 *
 * @typedef {Record<string, ListTicketState>} TicketStates
 */

/**
 * @typedef {{ kind: 'waitlist' | 'follow', href: string, text: string }} TicketFollowUp
 * @typedef {{ kind: 'buy', href: string, text: string }
 *   | { kind: 'note', text: string, followUp?: TicketFollowUp | null }
 *   | { kind: 'none' }} TicketCta
 * - `buy`: botón «Comprar entradas»;
 * - `note`: aviso sin link («Agotadas», «Venta cerrada»…). «Agotadas» suma `followUp`, para no
 *   perder a la persona, siempre hacia la PÁGINA DEL EVENTO (nunca directo a comprar): con lista de
 *   espera, a donde se anota (`#entradas`); sin lista, a «Seguir la serie» (`#seguir`, «Lo que sigo»);
 * - `none`: vende entradas acá pero la tarjeta no muestra nada (terminó o se canceló: eso ya lo
 *   dice el encabezado de la tarjeta; o la venta está en pausa de emergencia: ni botón ni aviso).
 */

/**
 * ¿El frontmatter dice que el evento vende entradas acá?
 * @param {Record<string, any> | null | undefined} meta
 */
export function hasOwnTickets(meta) {
	return meta?.category === 'calendario' && Array.isArray(meta.tickets) && meta.tickets.length > 0;
}

/**
 * «Abre el 5/10» (día y mes en hora de Argentina).
 * @param {number} ms
 */
export function opensText(ms) {
	return `Abre el ${argDayMonth(ms)}`;
}

/**
 * Lo que muestra la tarjeta para la venta de entradas de un evento. `null` si el evento no vende
 * entradas acá: la tarjeta sigue con el botón de inscripción de siempre (`link`).
 *
 * @param {Record<string, any>} meta frontmatter del evento (`postID`, `tickets`, `status`…)
 * @param {TicketStates | null | undefined} states el mapa del servidor; `null`/`undefined` si no
 *   está (página prerenderizada o sin base)
 * @param {{ past?: boolean }} [options]
 * @returns {TicketCta | null}
 */
export function ticketCta(meta, states, { past = false } = {}) {
	if (!hasOwnTickets(meta)) return null;
	const slug = String(meta.postID ?? '');
	// Con el mapa, un evento que no está no vende acá (configuración inválida, evento de prueba
	// en producción…).
	if (states && !Object.prototype.hasOwnProperty.call(states, slug)) return null;
	if (past || meta.status === 'cancelado' || meta.status === 'agotadas') return { kind: 'none' };
	/** @type {TicketCta} */
	const buy = { kind: 'buy', href: `/calendario/${slug}/entradas`, text: 'Comprar entradas' };
	const state = states?.[slug];
	if (!state || state.open) return buy;
	switch (state.reason) {
		case 'soldout':
			return soldOutNote(meta, slug, state.waitlist);
		case 'closed':
			return { kind: 'note', text: 'Venta cerrada' };
		case 'notyet':
			return { kind: 'note', text: state.opensAt ? opensText(state.opensAt) : 'Venta pronto' };
		case 'cancelled':
		case 'paused':
			return { kind: 'none' };
		default:
			return { kind: 'note', text: 'Venta no disponible' };
	}
}

/**
 * Qué ofrecer junto a «Agotadas». Los dos textos son del sitio; el bot los tiene en «Textos del bot»
 * (`eventos.boton_lista_espera`, `eventos.boton_avisame`). Sin lista de espera y sin serie (no hay
 * nada que seguir en la página), nada: queda solo «Agotadas».
 * @param {string} slug
 * @param {boolean | undefined} waitlist
 * @param {boolean} series ¿el evento es parte de una serie (hay «Seguir la serie» en su página)?
 * @returns {TicketFollowUp | null}
 */
export function soldOutFollowUp(slug, waitlist, series) {
	const href = `/calendario/${slug}`;
	if (waitlist)
		return { kind: 'waitlist', href: `${href}#entradas`, text: 'Anotate en la lista de espera' };
	return series ? { kind: 'follow', href: `${href}#seguir`, text: 'Avisame la próxima' } : null;
}

/**
 * @param {Record<string, any>} meta
 * @param {string} slug
 * @param {boolean | undefined} waitlist
 * @returns {TicketCta}
 */
function soldOutNote(meta, slug, waitlist) {
	const followUp = soldOutFollowUp(slug, waitlist, eventSeriesTags(meta.tags).length > 0);
	return followUp
		? { kind: 'note', text: 'Agotadas', followUp }
		: { kind: 'note', text: 'Agotadas' };
}

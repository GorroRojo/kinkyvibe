/**
 * Qué muestra la tarjeta de un evento (PostListItem) en lugar del botón de inscripción cuando el
 * evento vende entradas acá (frontmatter `tickets`, compra en /calendario/<slug>/entradas).
 *
 * El estado de la venta lo calcula el servidor para todos los eventos de la lista juntos
 * (`ticketStatesFor` en $lib/server/tickets/listStates.js, con las mismas reglas que la página del
 * evento) y llega como un mapa slug → estado. Sin mapa (página prerenderizada, sin base), la
 * tarjeta muestra igual el link a /entradas: ahí se ve si quedan.
 */

/**
 * Estado de la venta de un evento para las listas: lo mismo que `open`/`reason` del resumen de la
 * página del evento (`summarizeTickets`), más cuándo abre si todavía no abrió.
 *
 * @typedef {{
 *   open: boolean,
 *   reason: 'cancelled' | 'soldout' | 'closed' | 'notyet' | 'unavailable' | null,
 *   opensAt: number | null
 * }} ListTicketState
 *
 * @typedef {Record<string, ListTicketState>} TicketStates
 */

/**
 * @typedef {{ kind: 'buy', href: string, text: string }
 *   | { kind: 'note', text: string }
 *   | { kind: 'none' }} TicketCta
 * - `buy`: botón «Comprar entradas»;
 * - `note`: aviso sin link («Agotadas», «Venta cerrada»…);
 * - `none`: vende entradas acá pero la tarjeta no muestra nada (terminó o se canceló: eso ya lo
 *   dice el encabezado de la tarjeta).
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
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat('es-AR', {
			timeZone: 'America/Argentina/Buenos_Aires',
			day: 'numeric',
			month: 'numeric'
		})
			.formatToParts(new Date(ms))
			.map((p) => [p.type, p.value])
	);
	return `Abre el ${parts.day}/${parts.month}`;
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
			return { kind: 'note', text: 'Agotadas' };
		case 'closed':
			return { kind: 'note', text: 'Venta cerrada' };
		case 'notyet':
			return { kind: 'note', text: state.opensAt ? opensText(state.opensAt) : 'Venta pronto' };
		case 'cancelled':
			return { kind: 'none' };
		default:
			return { kind: 'note', text: 'Venta no disponible' };
	}
}

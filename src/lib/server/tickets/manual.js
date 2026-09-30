/**
 * "Cargar entradas a mano" (panel, /admin/eventos/<slug>/ordenes/cargar): invitaciones,
 * cortesías y pagos que llegaron por otro lado (efectivo antes del evento, una transferencia
 * directa, un canje…). Crea una orden YA aprobada con el canal `manual` y emite las entradas,
 * con la misma sentencia que la venta en la puerta (`insertApprovedOrder` de door.js), pero sin
 * marcar el ingreso.
 *
 * Límites (se pueden pasar con confirmación; ver overrides.js): el cupo del tipo, el máximo por
 * compra de la página (`MAX_TICKETS_PER_FORM`) y la venta cerrada (por horario, del tipo,
 * evento agotado o cancelado). "Todavía no abrió la venta" no es un límite: cargar invitaciones
 * antes es lo normal.
 */
import { MAX_TICKETS_PER_FORM, computePrice, remainingOf } from '$lib/utils/tickets.js';
import { salesState, typeOpen } from './config.js';
import { insertApprovedOrder } from './door.js';
import { getCounts } from './orders.js';
import { capacityLimit, closedLimit, maxPerPurchaseLimit } from './overrides.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Cómo se pagó una carga a mano. */
export const MANUAL_METHODS = /** @type {const} */ ([
	'efectivo',
	'transferencia',
	'cortesia',
	'otro'
]);
/** @typedef {(typeof MANUAL_METHODS)[number]} ManualMethod */

/** Largo máximo de la nota. */
export const MANUAL_NOTE_MAX = 300;

/**
 * @param {unknown} value
 * @returns {value is ManualMethod}
 */
export function isManualMethod(value) {
	return MANUAL_METHODS.includes(/** @type {any} */ (value));
}

/**
 * Qué límites pasaría esta carga.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   config: import('./config.js').EventTickets,
 *   type: import('./config.js').TicketType,
 *   quantity: number,
 *   now?: number
 * }} input
 * @returns {Promise<import('./overrides.js').ExceededLimit[]>}
 */
export async function manualOrderLimits(
	db,
	{ eventSlug, config, type, quantity, now = Date.now() }
) {
	const c = (await getCounts(db, eventSlug, now)).get(type.id);
	return /** @type {import('./overrides.js').ExceededLimit[]} */ (
		[
			closedLimit(salesState(config, now), typeOpen(config, type, now) ? null : type),
			maxPerPurchaseLimit(quantity, MAX_TICKETS_PER_FORM),
			capacityLimit(type, c ? c.sold + c.held : 0, quantity)
		].filter(Boolean)
	);
}

/**
 * Crea la orden aprobada y emite las entradas. `amount` es el monto POR ENTRADA en pesos
 * enteros (0 = sin cargo); una cortesía es siempre sin cargo. Un total 0 queda con medio
 * `gratis` (como la compra online sin cargo).
 *
 * Con `override: true` (une admin confirmó los límites de `manualOrderLimits` en el diálogo) no
 * se controla el cupo; si no, se controla en la misma sentencia que crea la orden.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   type: import('./config.js').TicketType,
 *   quantity: number,
 *   holders: import('./config.js').Holder[],
 *   buyer: { name: string, pronouns?: string, email?: string },
 *   method: ManualMethod,
 *   amount: number,
 *   note?: string,
 *   override?: boolean,
 *   by: string,
 *   now?: number
 * }} input
 * @returns {Promise<{ ok: true, order: import('./orders.js').Order,
 *     tickets: import('./orders.js').Ticket[] }
 *   | { ok: false, reason: 'soldout', available: number | null }>}
 */
export async function createManualOrder(db, input) {
	const { eventSlug, type, quantity, holders, buyer, by, now = Date.now() } = input;
	if (!isManualMethod(input.method)) throw new Error('Medio de pago inválido');
	const amount = input.method === 'cortesia' ? 0 : input.amount;
	if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Monto inválido');
	const prices = computePrice({
		price: amount,
		fondo: 0,
		option: type.gorra ? 'gorra' : 'completo',
		quantity,
		discount: null,
		method: input.method
	});
	// La cortesía siempre da 0: queda como `gratis`.
	/** @type {import('./orders.js').OrderPaymentMethod} */
	const method = prices.total === 0 ? 'gratis' : /** @type {any} */ (input.method);
	const r = await insertApprovedOrder(db, {
		eventSlug,
		type,
		quantity,
		holders,
		buyer: { ...buyer, dni: null },
		method,
		unitPrice: amount,
		prices,
		fondoPercent: null,
		channel: 'manual',
		note: (input.note ?? '').trim().slice(0, MANUAL_NOTE_MAX),
		checkIn: false,
		override: input.override,
		by,
		now
	});
	if (!r.ok) {
		const c = (await getCounts(db, eventSlug, now)).get(type.id);
		return { ok: false, reason: 'soldout', available: remainingOf(type, c) };
	}
	return r;
}

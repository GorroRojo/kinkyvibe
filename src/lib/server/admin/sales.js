/**
 * Ventas de todos los eventos para el panel (`/admin/entradas`) y la bandeja de transferencias
 * (`/admin/entradas/transferencias`). Consultas de solo lectura sobre `orders`; los números son
 * los mismos que `getCounts` (orders.js) pero de todos los eventos en una sola consulta.
 */
import { HOLDING } from '$lib/server/tickets/discounts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */

/**
 * @typedef {{ sold: number, held: number, revenue: number, fondo: number, contribution: number,
 *   surcharge: number }} TypeCounts
 */

/** Transferencias vencidas que se siguen mostrando (por si el pago llega tarde). */
export const EXPIRED_TRANSFER_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Conteos por evento y tipo de entrada, de todos los eventos (una consulta).
 *
 * @param {D1Database} db
 * @param {number} [now]
 * @returns {Promise<Map<string, Map<string, TypeCounts>>>} slug → tipo → conteos
 */
export async function getAllCounts(db, now = Date.now()) {
	const { results } = await db
		.prepare(
			`SELECT event_slug, ticket_type,
				SUM(CASE WHEN status = 'approved' THEN quantity ELSE 0 END) AS sold,
				SUM(CASE WHEN status IN ${HOLDING} AND expires_at > ?1 THEN quantity ELSE 0 END) AS held,
				SUM(CASE WHEN status = 'approved' THEN total ELSE 0 END) AS revenue,
				SUM(CASE WHEN status = 'approved' THEN fondo_amount ELSE 0 END) AS fondo,
				SUM(CASE WHEN status = 'approved' THEN fondo_contribution ELSE 0 END) AS contribution,
				SUM(CASE WHEN status = 'approved' THEN surcharge_amount ELSE 0 END) AS surcharge
			FROM orders GROUP BY event_slug, ticket_type`
		)
		.bind(now)
		.all();
	/** @type {Map<string, Map<string, TypeCounts>>} */
	const out = new Map();
	for (const r of results) {
		const slug = String(r.event_slug);
		const byType = out.get(slug) ?? new Map();
		byType.set(String(r.ticket_type), {
			sold: Number(r.sold ?? 0),
			held: Number(r.held ?? 0),
			revenue: Number(r.revenue ?? 0),
			fondo: Number(r.fondo ?? 0),
			contribution: Number(r.contribution ?? 0),
			surcharge: Number(r.surcharge ?? 0)
		});
		out.set(slug, byType);
	}
	return out;
}

/**
 * @typedef {{
 *   id: string, name: string, price: number | null, gorra: { min: number, recommended?: number | null, suggested: number } | null,
 *   capacity: number | null, fondo: number, sold: number, held: number, revenue: number,
 *   fondoUsed: number, contribution: number, surcharge: number, over: boolean
 * }} TypeSales
 *
 * `capacity` `null`: el tipo no tiene cupo (sin límite); nunca está "pasado".
 */

/**
 * @typedef {{
 *   slug: string, title: string, start: string | null, status: string | null,
 *   upcoming: boolean, fondoEnabled: boolean, online: boolean, review: number,
 *   types: TypeSales[], sold: number, held: number, capacity: number | null, revenue: number,
 *   fondoUsed: number, contribution: number, fondoNet: number, surcharge: number
 * }} EventSales
 *
 * `capacity` del evento: la suma de los cupos, o `null` si algún tipo no tiene cupo.
 */

/**
 * Arma la fila de un evento: sus tipos con los conteos y los totales. Pura (para los tests).
 *
 * @param {{ slug: string, config: import('$lib/server/tickets/config.js').EventTickets }} event
 * @param {Map<string, TypeCounts> | undefined} counts
 * @param {{ now?: number, review?: number }} [opts]
 * @returns {EventSales}
 */
export function summarizeEvent({ slug, config }, counts, { now = Date.now(), review = 0 } = {}) {
	const types = config.types.map((t) => {
		const c = counts?.get(t.id);
		const sold = c?.sold ?? 0;
		/** @type {number | null} */
		const capacity = t.capacity ?? null;
		return {
			id: t.id,
			name: t.name,
			price: t.gorra ? null : t.price,
			gorra: t.gorra
				? {
						min: t.gorra.min,
						recommended: t.gorra.recommended ?? null,
						suggested: t.gorra.suggested
					}
				: null,
			capacity,
			fondo: t.fondo ?? 0,
			sold,
			held: c?.held ?? 0,
			revenue: c?.revenue ?? 0,
			fondoUsed: c?.fondo ?? 0,
			contribution: c?.contribution ?? 0,
			surcharge: c?.surcharge ?? 0,
			over: capacity !== null && sold > capacity
		};
	});
	/** @param {(t: TypeSales) => number} f */
	const sum = (f) => types.reduce((s, t) => s + f(t), 0);
	const start = config.start ?? null;
	const startMs = start ? Date.parse(start) : NaN;
	return {
		slug,
		title: config.title,
		start,
		status: config.status ?? null,
		// Sin fecha cuenta como próximo (mejor verlo que perderlo).
		upcoming: Number.isFinite(startMs) ? startMs >= now - 12 * 60 * 60 * 1000 : true,
		fondoEnabled: Boolean(config.fondoEnabled),
		online: Boolean(config.online),
		review,
		types,
		sold: sum((t) => t.sold),
		held: sum((t) => t.held),
		capacity: types.some((t) => t.capacity === null) ? null : sum((t) => t.capacity ?? 0),
		revenue: sum((t) => t.revenue),
		fondoUsed: sum((t) => t.fondoUsed),
		contribution: sum((t) => t.contribution),
		// Neto del fondo: aportes − lo que cubrió (negativo = el fondo puso más de lo que entró).
		fondoNet: sum((t) => t.contribution - t.fondoUsed),
		surcharge: sum((t) => t.surcharge)
	};
}

/**
 * Totales de una lista de eventos (para las tarjetas de arriba).
 *
 * @param {EventSales[]} events
 */
export function salesTotals(events) {
	/** @param {(e: EventSales) => number} f */
	const sum = (f) => events.reduce((s, e) => s + f(e), 0);
	return {
		events: events.length,
		sold: sum((e) => e.sold),
		held: sum((e) => e.held),
		revenue: sum((e) => e.revenue),
		fondoUsed: sum((e) => e.fondoUsed),
		contribution: sum((e) => e.contribution),
		fondoNet: sum((e) => e.fondoNet),
		review: sum((e) => e.review)
	};
}

/**
 * Transferencias de todos los eventos que esperan comprobante (y las vencidas de los últimos
 * 7 días, por si el pago llega tarde). Las vigentes primero, la que vence antes arriba; después
 * las vencidas, la más reciente arriba.
 *
 * @param {D1Database} db
 * @param {{ now?: number, eventSlug?: string }} [opts]
 * @returns {Promise<{ pending: Order[], expired: Order[] }>}
 */
export async function listTransferInbox(db, { now = Date.now(), eventSlug } = {}) {
	const { results } = await db
		.prepare(
			`SELECT * FROM orders
			WHERE payment_method = 'transferencia'
				AND status IN ('awaiting_transfer', 'expired')
				AND expires_at > ?1
				AND (?2 IS NULL OR event_slug = ?2)
			ORDER BY expires_at ASC`
		)
		.bind(now - EXPIRED_TRANSFER_VISIBLE_MS, eventSlug ?? null)
		.all();
	const orders = /** @type {Order[]} */ (results);
	return {
		pending: orders.filter((o) => o.status === 'awaiting_transfer' && o.expires_at > now),
		expired: orders
			.filter((o) => !(o.status === 'awaiting_transfer' && o.expires_at > now))
			.reverse()
	};
}

/**
 * Extras de la compra en D1 (tabla `order_extras` y `orders.extras_amount`, migración 0077;
 * docs/tickets.md, «Extras»; decisión 0056). Prototipo detrás del interruptor `extras`.
 *
 * - **Tope sin sobreventa:** cada extra se inserta en la **misma tanda** que la orden, con una
 *   sentencia que mira lo tomado (aprobadas + reservas vigentes, la misma regla que el cupo de las
 *   entradas). Si no alcanza, inserta cantidad 0: el CHECK `extras_stock` falla y D1 deshace la
 *   tanda entera, con la orden (`isExtrasStockError`). Si la orden no entró (por el cupo de las
 *   entradas), el extra tampoco.
 * - **Entregar** (puerta o barra): un único `UPDATE` condicional (`delivered < quantity`, orden
 *   aprobada, entrada de **ese** evento): dos celus a la vez no entregan de más.
 * - Sin la migración, las lecturas devuelven vacío (el panel sigue andando).
 */
import { logDBError } from '$lib/server/db';
import { HOLDING } from './holding.js';
import { extraAvailable } from '$lib/utils/extras.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('$lib/utils/extras.js').ExtraLine} ExtraLine */

/**
 * Un extra de una orden, como se guardó.
 *
 * @typedef {{ id: string, name: string, price: number, quantity: number, delivered: number }} OrderExtra
 */

/** Lo tomado de un extra en un evento: aprobadas y reservas vigentes. */
const TAKEN_SQL = (event = '?2', extra = '?3', now = '?7') => `(
	SELECT COALESCE(SUM(oe.quantity), 0) FROM order_extras oe JOIN orders o ON o.id = oe.order_id
	WHERE oe.event_slug = ${event} AND oe.extra_id = ${extra}
		AND (o.status = 'approved' OR (o.status IN ${HOLDING} AND o.expires_at > ${now}))
)`;

/**
 * Las sentencias que guardan los extras de una orden, para la misma tanda que la crea (van
 * **después** del INSERT de la orden). Con `capacity`, controlan el tope (ver arriba); con
 * `override` (une admin que pasa límites), no.
 *
 * @param {D1Database} db
 * @param {{ orderId: string, eventSlug: string, lines: (ExtraLine & { capacity?: number | null })[],
 *   now: number, override?: boolean }} input
 * @returns {D1PreparedStatement[]}
 */
export function extrasStatements(db, { orderId, eventSlug, lines, now, override = false }) {
	return lines.map((l) =>
		db
			.prepare(
				`INSERT INTO order_extras (order_id, event_slug, extra_id, name, unit_price, quantity,
					created_at)
				SELECT ?1, ?2, ?3, ?4, ?5,
					CASE WHEN ?8 IS NULL OR ${TAKEN_SQL()} + ?6 <= ?8 THEN ?6 ELSE 0 END, ?7
				WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?1)`
			)
			.bind(
				orderId,
				eventSlug,
				l.id,
				l.name,
				l.price,
				l.quantity,
				now,
				override ? null : (l.capacity ?? null)
			)
	);
}

/**
 * ¿La tanda falló porque un extra no alcanzó (CHECK `extras_stock`)?
 *
 * @param {unknown} error
 */
export function isExtrasStockError(error) {
	return /extras_stock/.test(String(/** @type {any} */ (error)?.message ?? error));
}

/**
 * Lo tomado de cada extra del evento (aprobadas + reservas vigentes).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} [now]
 * @returns {Promise<Map<string, number>>}
 */
export async function extrasTaken(db, eventSlug, now = Date.now()) {
	const { results } = await db
		.prepare(
			`SELECT oe.extra_id AS id, COALESCE(SUM(oe.quantity), 0) AS n
			FROM order_extras oe JOIN orders o ON o.id = oe.order_id
			WHERE oe.event_slug = ?1
				AND (o.status = 'approved' OR (o.status IN ${HOLDING} AND o.expires_at > ?2))
			GROUP BY oe.extra_id`
		)
		.bind(eventSlug, now)
		.all();
	return new Map(results.map((r) => [String(r.id), Number(r.n)]));
}

/**
 * Lo que queda de cada extra para comprar ahora (`available`, ya acotado al máximo por compra).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {import('$lib/utils/extras.js').Extra[]} extras
 * @param {number} [now]
 */
export async function extrasAvailability(db, eventSlug, extras, now = Date.now()) {
	const taken = extras.some((e) => e.capacity !== null)
		? await extrasTaken(db, eventSlug, now)
		: new Map();
	/** @type {Record<string, number>} */
	const out = {};
	for (const e of extras) out[e.id] = extraAvailable(e, taken.get(e.id) ?? 0);
	return out;
}

/**
 * @param {Record<string, unknown>} r
 * @returns {OrderExtra}
 */
const toExtra = (r) => ({
	id: String(r.extra_id),
	name: String(r.name),
	price: Number(r.unit_price),
	quantity: Number(r.quantity),
	delivered: Number(r.delivered)
});

/**
 * Los extras de una orden (sin la migración, ninguno).
 *
 * @param {D1Database} db
 * @param {string} orderId
 * @returns {Promise<OrderExtra[]>}
 */
export async function orderExtras(db, orderId) {
	try {
		const { results } = await db
			.prepare('SELECT * FROM order_extras WHERE order_id = ?1 ORDER BY rowid')
			.bind(orderId)
			.all();
		return results.map(toExtra);
	} catch (error) {
		logDBError('order extras', error);
		return [];
	}
}

/**
 * Los extras de las órdenes de un evento, por orden (Órdenes, CSV). Sin la migración, vacío.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<Map<string, OrderExtra[]>>}
 */
export async function extrasByOrder(db, eventSlug) {
	/** @type {Map<string, OrderExtra[]>} */
	const out = new Map();
	try {
		const { results } = await db
			.prepare('SELECT * FROM order_extras WHERE event_slug = ?1 ORDER BY rowid')
			.bind(eventSlug)
			.all();
		for (const r of results) {
			const id = String(r.order_id);
			out.set(id, [...(out.get(id) ?? []), toExtra(r)]);
		}
	} catch (error) {
		logDBError('extras by order', error);
	}
	return out;
}

/**
 * Por extra del evento, en las órdenes aprobadas: cuántos se vendieron, cuántos se entregaron y lo
 * que sumaron (Ventas › Totales y el resumen de la barra). Sin la migración, vacío.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<{ id: string, name: string, sold: number, delivered: number, amount: number }[]>}
 */
export async function extrasSummary(db, eventSlug) {
	try {
		const { results } = await db
			.prepare(
				`SELECT oe.extra_id AS id, MAX(oe.name) AS name, SUM(oe.quantity) AS sold,
					SUM(oe.delivered) AS delivered, SUM(oe.quantity * oe.unit_price) AS amount
				FROM order_extras oe JOIN orders o ON o.id = oe.order_id
				WHERE oe.event_slug = ?1 AND o.status = 'approved'
				GROUP BY oe.extra_id ORDER BY MIN(oe.rowid)`
			)
			.bind(eventSlug)
			.all();
		return results.map((r) => ({
			id: String(r.id),
			name: String(r.name),
			sold: Number(r.sold),
			delivered: Number(r.delivered),
			amount: Number(r.amount)
		}));
	} catch (error) {
		logDBError('extras summary', error);
		return [];
	}
}

/**
 * Entrega **uno** de un extra de la orden de una entrada del evento: solo si la orden está
 * aprobada y todavía quedan por entregar. Un único `UPDATE` (dos celus a la vez no se pasan).
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, ticketId: string, extraId: string, now?: number }} input
 * @returns {Promise<{ ok: true, orderId: string, extra: OrderExtra }
 *   | { ok: false, reason: 'not-found' | 'none-left' }>}
 */
export async function deliverExtra(db, { eventSlug, ticketId, extraId, now = Date.now() }) {
	if (typeof ticketId !== 'string' || !ticketId || typeof extraId !== 'string' || !extraId)
		return { ok: false, reason: 'not-found' };
	const row = await db
		.prepare(
			`UPDATE order_extras SET delivered = delivered + 1, updated_at = ?4
			WHERE extra_id = ?3 AND event_slug = ?2 AND delivered < quantity
				AND order_id = (SELECT t.order_id FROM tickets t JOIN orders o ON o.id = t.order_id
					WHERE t.id = ?1 AND t.event_slug = ?2 AND o.status = 'approved')
			RETURNING *`
		)
		.bind(ticketId, eventSlug, extraId, now)
		.first();
	if (row) return { ok: true, orderId: String(row.order_id), extra: toExtra(row) };
	const exists = await db
		.prepare(
			`SELECT 1 FROM order_extras oe JOIN tickets t ON t.order_id = oe.order_id
			JOIN orders o ON o.id = oe.order_id
			WHERE t.id = ?1 AND t.event_slug = ?2 AND oe.extra_id = ?3 AND o.status = 'approved'`
		)
		.bind(ticketId, eventSlug, extraId)
		.first();
	return { ok: false, reason: exists ? 'none-left' : 'not-found' };
}

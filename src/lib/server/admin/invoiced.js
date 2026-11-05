/**
 * «Facturada»: la marca que pone une admin cuando ya facturó una compra (docs/tickets.md,
 * «Compras para facturar»; migración 0076). Se marca y desmarca en Ventas › Órdenes de cada
 * evento y en Ventas › Compras para facturar (`/admin/ventas/facturar`). Solo admins: les
 * organizadores y la página pública nunca la ven.
 *
 * Qué compra es «para facturar» ({@link TO_INVOICE_SQL}, {@link countsForInvoicing}): una orden
 * aprobada con plata de por medio, es decir con total mayor que 0 y que no se devolvió entera (lo
 * cobrado menos los reembolsos parciales, `REVENUE_SQL` de $lib/utils/salesGoal.js, mayor que 0).
 * Entra cualquier canal y medio (online, puerta, cargada a mano). No entran las cortesías ni lo
 * que salió $ 0 a la gorra, las reservas sin pagar ni las reembolsadas.
 *
 * Marcarla no toca `updated_at` (el panel y el bot lo usan como el momento de la venta).
 */
import { REVENUE_SQL, orderRevenue } from '$lib/utils/salesGoal.js';
import { MONTHS_ES, arClock, arMonthWindow, AR_UTC_OFFSET_MS } from '$lib/utils/dates.js';
import { orderReference } from '$lib/utils/tickets.js';
import { saleChannel } from '$lib/utils/saleChannel.js';
import { EVENT_START_SQL } from '$lib/server/admin/saleMonth.js';
import { logAdminAction } from '$lib/server/admin/audit.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** La condición de una orden «para facturar», sobre la tabla `orders` (con o sin alias). */
export const TO_INVOICE_SQL = `status = 'approved' AND total > 0 AND ${REVENUE_SQL} > 0`;

/** Cuántas compras sin facturar trae la lista como mucho (las más viejas). */
export const INVOICE_LIST_LIMIT = 500;

/**
 * {@link TO_INVOICE_SQL} sobre una orden ya leída.
 * @param {{ status: string, total: number, refunded_amount?: number | null }} order
 */
export function countsForInvoicing(order) {
	return order.status === 'approved' && Number(order.total) > 0 && orderRevenue(order) > 0;
}

/**
 * El mes de Argentina de la compra (`YYYY-MM`), el que agrupa la lista: el de la fecha de compra.
 * @param {number} ms
 */
export function invoiceMonthKey(ms) {
	return arClock(ms).toISOString().slice(0, 7);
}

/**
 * «Octubre 2026».
 * @param {string} key `YYYY-MM`
 */
export function invoiceMonthLabel(key) {
	const [y, m] = key.split('-').map(Number);
	const name = MONTHS_ES[m - 1] ?? key;
	return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
}

/** Un `YYYY-MM` válido de la URL, o ''. @param {unknown} value */
export function parseMonthKey(value) {
	const s = String(value ?? '');
	return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : '';
}

/**
 * Marca (o desmarca) una orden como facturada. Marcar solo anda en una orden «para facturar»;
 * desmarcar, en cualquiera que esté marcada.
 *
 * @param {D1Database} db
 * @param {string} orderId
 * @param {boolean} invoiced
 * @param {string} by el login de quien la marca
 * @param {{ eventSlug?: string, now?: number }} [opts] con `eventSlug`, solo si la orden es de ese
 *   evento (si no, `not_found`)
 * @returns {Promise<{ result: 'done' | 'already' | 'not_found' | 'not_eligible',
 *   order: import('$lib/server/tickets/orders.js').Order | null }>}
 */
export async function setOrderInvoiced(
	db,
	orderId,
	invoiced,
	by,
	{ eventSlug, now = Date.now() } = {}
) {
	if (typeof orderId !== 'string' || !orderId || orderId.length > 64) {
		return { result: 'not_found', order: null };
	}
	const slug = eventSlug ?? null;
	const res = invoiced
		? await db
				.prepare(
					`UPDATE orders SET invoiced_at = ?2, invoiced_by = ?3
					WHERE id = ?1 AND (?4 IS NULL OR event_slug = ?4) AND invoiced_at IS NULL
						AND ${TO_INVOICE_SQL}`
				)
				.bind(orderId, now, by, slug)
				.run()
		: await db
				.prepare(
					`UPDATE orders SET invoiced_at = NULL, invoiced_by = NULL
					WHERE id = ?1 AND (?2 IS NULL OR event_slug = ?2) AND invoiced_at IS NOT NULL`
				)
				.bind(orderId, slug)
				.run();
	const order = /** @type {import('$lib/server/tickets/orders.js').Order | null} */ (
		await db.prepare('SELECT * FROM orders WHERE id = ?1').bind(orderId).first()
	);
	if (!order || (slug !== null && order.event_slug !== slug)) {
		return { result: 'not_found', order: null };
	}
	if (res.meta.changes === 1) return { result: 'done', order };
	if (invoiced && !order.invoiced_at && !countsForInvoicing(order)) {
		return { result: 'not_eligible', order };
	}
	return { result: 'already', order };
}

/**
 * La casilla «Facturada» del panel (acción `invoiced` de Ventas › Órdenes y de Compras para
 * facturar): marca o desmarca y lo deja en Actividad (`order.invoiced` / `order.uninvoiced`).
 * Con `eventSlug`, la orden tiene que ser de ese evento.
 *
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ orderId: string, invoiced: boolean, by: string, eventSlug?: string, now?: number }} input
 */
export async function invoicedFromPanel(db, locals, { orderId, invoiced, by, eventSlug, now }) {
	const r = await setOrderInvoiced(db, orderId, invoiced, by, { eventSlug, now });
	if (!r.order) {
		return {
			ok: false,
			status: 404,
			body: { invoiced: { ok: false, order: orderId, message: 'No encontramos esa orden.' } }
		};
	}
	const order = r.order;
	if (r.result === 'not_eligible') {
		return {
			ok: false,
			status: 400,
			body: {
				invoiced: {
					ok: false,
					order: order.id,
					message: 'Esa orden no tiene un pago para facturar.'
				}
			}
		};
	}
	if (r.result === 'done') {
		const reference = orderReference(order.id);
		await logAdminAction(db, locals, {
			action: invoiced ? 'order.invoiced' : 'order.uninvoiced',
			targetType: 'order',
			targetId: order.id,
			summary: invoiced
				? `Marcó como facturada la orden ${reference}`
				: `Desmarcó como facturada la orden ${reference}`,
			detail: { event: order.event_slug, total: order.total }
		});
	}
	const message =
		r.result === 'done'
			? invoiced
				? 'Marcada como facturada.'
				: 'Marcada como sin facturar.'
			: invoiced
				? 'Esa orden ya estaba facturada.'
				: 'Esa orden ya estaba sin facturar.';
	return {
		ok: true,
		status: 200,
		body: {
			invoiced: {
				ok: true,
				order: order.id,
				message,
				invoicedAt: order.invoiced_at ?? null,
				invoicedBy: order.invoiced_by ?? null
			}
		}
	};
}

/** Lo que trae cada fila de la lista de Compras para facturar. */
const ROW_SQL = `SELECT o.id, o.event_slug, o.buyer_name, o.payment_method, o.channel, o.status,
	o.total, o.refunded_amount, o.quantity, o.created_at, o.invoiced_at, o.invoiced_by,
	(SELECT ev.title FROM objects ev WHERE ev.type = 'evento' AND ev.slug = o.event_slug) AS event_title,
	${EVENT_START_SQL} AS event_start
	FROM orders o`;

/**
 * @typedef {{ id: string, reference: string, slug: string, event: string,
 *   eventStart: number | null, name: string, method: string,
 *   channel: import('$lib/utils/saleChannel.js').SaleChannel, total: number,
 *   quantity: number, createdAt: number, month: string,
 *   invoicedAt: number | null, invoicedBy: string | null }} InvoiceRow
 */

/**
 * @param {Record<string, unknown>} r
 * @returns {InvoiceRow}
 */
function toRow(r) {
	const id = String(r.id);
	const createdAt = Number(r.created_at);
	return {
		id,
		reference: orderReference(id),
		slug: String(r.event_slug),
		event: r.event_title ? String(r.event_title) : String(r.event_slug),
		eventStart: typeof r.event_start === 'number' ? r.event_start : null,
		name: String(r.buyer_name ?? ''),
		method: String(r.payment_method),
		channel: saleChannel({
			channel: /** @type {string | null} */ (r.channel),
			payment_method: /** @type {string | null} */ (r.payment_method)
		}),
		total: Number(r.total),
		quantity: Number(r.quantity),
		createdAt,
		month: invoiceMonthKey(createdAt),
		invoicedAt: r.invoiced_at == null ? null : Number(r.invoiced_at),
		invoicedBy: r.invoiced_by == null ? null : String(r.invoiced_by)
	};
}

/**
 * Las compras sin facturar de todos los eventos, de la más vieja a la más nueva.
 *
 * @param {D1Database} db
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<InvoiceRow[]>}
 */
export async function listUninvoicedOrders(db, { limit = INVOICE_LIST_LIMIT } = {}) {
	const { results } = await db
		.prepare(
			`${ROW_SQL} WHERE o.invoiced_at IS NULL AND ${TO_INVOICE_SQL}
			ORDER BY o.created_at ASC, o.id ASC LIMIT ?1`
		)
		.bind(limit)
		.all();
	return results.map(toRow);
}

/**
 * Las facturadas de un mes de compra (`YYYY-MM`, en hora de Argentina).
 *
 * @param {D1Database} db
 * @param {string} month
 * @returns {Promise<InvoiceRow[]>}
 */
export async function listInvoicedInMonth(db, month) {
	const key = parseMonthKey(month);
	if (!key) return [];
	const [y, m] = key.split('-').map(Number);
	const { start, end } = arMonthWindow(y, m - 1);
	const { results } = await db
		.prepare(
			`${ROW_SQL} WHERE o.invoiced_at IS NOT NULL AND ${TO_INVOICE_SQL}
				AND o.created_at >= ?1 AND o.created_at < ?2
			ORDER BY o.created_at ASC, o.id ASC`
		)
		.bind(start, end)
		.all();
	return results.map(toRow);
}

/**
 * Por mes de compra: cuántas compras «para facturar» faltan y cuántas ya están facturadas. Del
 * más viejo al más nuevo.
 *
 * @param {D1Database} db
 * @returns {Promise<{ month: string, pending: number, invoiced: number }[]>}
 */
export async function invoiceMonths(db) {
	const { results } = await db
		.prepare(
			`SELECT strftime('%Y-%m', (created_at + ?1) / 1000, 'unixepoch') AS month,
				SUM(CASE WHEN invoiced_at IS NULL THEN 1 ELSE 0 END) AS pending,
				SUM(CASE WHEN invoiced_at IS NOT NULL THEN 1 ELSE 0 END) AS invoiced
			FROM orders WHERE ${TO_INVOICE_SQL}
			GROUP BY month ORDER BY month`
		)
		.bind(AR_UTC_OFFSET_MS)
		.all();
	return results.map((r) => ({
		month: String(r.month),
		pending: Number(r.pending ?? 0),
		invoiced: Number(r.invoiced ?? 0)
	}));
}

/**
 * Cuántas compras faltan facturar, de todos los eventos (el número del botón en Ventas).
 * @param {D1Database} db
 */
export async function countUninvoicedOrders(db) {
	const row = await db
		.prepare(`SELECT COUNT(*) AS n FROM orders WHERE invoiced_at IS NULL AND ${TO_INVOICE_SQL}`)
		.first();
	return Number(row?.n ?? 0);
}

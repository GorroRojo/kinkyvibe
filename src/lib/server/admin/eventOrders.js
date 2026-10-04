/**
 * Órdenes de un evento tal como las muestran las pestañas de la ficha del panel (Órdenes,
 * Transferencias, Ventas). Es lo que antes armaba la vieja página por evento de Entradas, repartido.
 */
import { listEventTickets, listOrders, orderHolders } from '$lib/server/tickets/orders.js';
import { orderReference } from '$lib/utils/tickets.js';
import { answersByOrder } from '$lib/server/tickets/signupFields.js';
import { dniTail } from '$lib/server/tickets/door.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { dniQueryDigits } from '$lib/admin/orderFormat.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Transferencias vencidas que se siguen mostrando (por si el pago llega tarde). */
export const EXPIRED_TRANSFER_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {import('$lib/server/tickets/config.js').EventTickets} config
 * @param {number} [now]
 */
export async function eventOrderRows(db, slug, config, now = Date.now()) {
	const [orders, tickets, answers] = await Promise.all([
		listOrders(db, slug),
		listEventTickets(db, slug),
		// Respuestas a las preguntas de inscripción (datos de quien compra; les organizadores ven una parte en Mi rincón).
		answersByOrder(db, slug)
	]);
	const names = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	/** @type {Map<string, { name: string, pronouns: string, checkedIn: boolean }[]>} */
	const holdersByOrder = new Map();
	for (const t of tickets) {
		const list = holdersByOrder.get(t.order_id) ?? [];
		list.push({
			name: t.holder_name,
			pronouns: t.holder_pronouns ?? '',
			checkedIn: Boolean(t.checked_in_at)
		});
		holdersByOrder.set(t.order_id, list);
	}
	const rows = orders.map((o) => ({
		id: o.id,
		reference: orderReference(o.id),
		name: o.buyer_name,
		email: o.buyer_email,
		// Del DNI de quien compra solo van los últimos 3 dígitos: el completo se pide aparte, orden
		// por orden, con `revealOrderDni` (y queda en el registro de actividad).
		dniTail: dniTail(o.buyer_dni),
		type: names[o.ticket_type] ?? o.ticket_type,
		quantity: o.quantity,
		pronouns: o.buyer_pronouns ?? '',
		gorra: o.fondo_option === 'gorra' ? o.unit_price : null,
		fondo: o.fondo_amount,
		fondoOption: o.fondo_option,
		contribution: o.fondo_contribution,
		surcharge: o.surcharge_amount,
		subtotal: o.subtotal,
		discountCode: o.discount_code,
		discountAmount: o.discount_amount,
		total: o.total,
		method: o.payment_method,
		// Una reserva vencida que todavía no se marcó como tal se muestra como vencida.
		status:
			(o.status === 'pending' || o.status === 'awaiting_transfer' || o.status === 'rejected') &&
			o.expires_at <= now
				? /** @type {const} */ ('expired')
				: o.status,
		checkedIn: o.checked_in,
		emailSent: Boolean(o.email_sent_at),
		createdAt: o.created_at,
		expiresAt: o.expires_at,
		paymentId: o.mp_payment_id,
		confirmedBy: o.confirmed_by,
		refundedAt: o.refunded_at ?? null,
		refundedBy: o.refunded_by ?? null,
		needsReview: o.needs_review ?? null,
		reviewDetail: o.review_detail ?? null,
		holders:
			holdersByOrder.get(o.id) ??
			(o.holders ? orderHolders(o).map((h) => ({ ...h, checkedIn: false })) : []),
		answers: answers.get(o.id) ?? []
	}));
	return { orders, rows, answers };
}

/**
 * Las transferencias para confirmar: esperando el pago, o vencidas hace menos de 7 días.
 * @template {{ method: string, status: string, expiresAt: number }} R
 * @param {R[]} rows
 * @param {number} [now]
 */
export function pendingTransfers(rows, now = Date.now()) {
	return rows.filter(
		(o) =>
			o.method === 'transferencia' &&
			(o.status === 'awaiting_transfer' ||
				(o.status === 'expired' && o.expiresAt > now - EXPIRED_TRANSFER_VISIBLE_MS))
	);
}

/** Cuántas órdenes como mucho devuelve una búsqueda por DNI. */
export const DNI_SEARCH_LIMIT = 200;

/**
 * Ids de las órdenes del evento cuyo DNI empieza con esos dígitos (el buscador de Órdenes: el
 * DNI completo nunca va a la página, así que la coincidencia se busca acá). No devuelve el DNI.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {string} query lo que se escribió (ver {@link dniQueryDigits})
 * @returns {Promise<string[]>}
 */
export async function orderIdsByDni(db, slug, query) {
	const digits = dniQueryDigits(query);
	if (!digits) return [];
	const { results } = await db
		.prepare(
			`SELECT id FROM orders WHERE event_slug = ?1 AND buyer_dni IS NOT NULL
			AND replace(replace(replace(buyer_dni, '.', ''), ' ', ''), '-', '') LIKE ?2
			ORDER BY created_at DESC LIMIT ?3`
		)
		.bind(slug, `${digits}%`, DNI_SEARCH_LIMIT)
		.all();
	return results.map((r) => String(r.id));
}

/**
 * «Mostrar» el DNI completo de una orden del evento (pestañas Órdenes y Transferencias). Como en
 * la ficha de la persona, cada vez queda en el registro de actividad (`person.dni.reveal`), sin
 * el DNI. `null` si la orden no es de este evento o no tiene DNI (y entonces no se registra).
 *
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ slug: string, orderId: string }} input
 * @returns {Promise<string | null>}
 */
export async function revealOrderDni(db, locals, { slug, orderId }) {
	if (typeof orderId !== 'string' || !orderId || orderId.length > 64) return null;
	const row = await db
		.prepare('SELECT id, buyer_dni FROM orders WHERE id = ?1 AND event_slug = ?2')
		.bind(orderId, slug)
		.first();
	const dni = row?.buyer_dni == null ? '' : String(row.buyer_dni).trim();
	if (!dni) return null;
	await logAdminAction(db, locals, {
		action: 'person.dni.reveal',
		targetType: 'order',
		targetId: String(row?.id),
		summary: `Miró el DNI de la compra ${orderReference(String(row?.id))}`,
		detail: { event: slug }
	});
	return dni;
}

/**
 * Órdenes de un evento tal como las muestran las pestañas de la ficha del panel (Órdenes,
 * Transferencias, Ventas). Es lo que antes armaba /admin/entradas/<slug>, repartido.
 */
import { listEventTickets, listOrders, orderHolders } from '$lib/server/tickets/orders.js';
import { orderReference } from '$lib/utils/tickets.js';
import { answersByOrder } from '$lib/server/tickets/signupFields.js';

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
		// El DNI de quien compra: solo en el admin (para chequear en la puerta si hace falta).
		dni: o.buyer_dni ?? '',
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

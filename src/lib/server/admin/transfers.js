/**
 * Confirmar o cancelar una transferencia desde el panel, sin saber de antemano de qué evento es
 * (la bandeja `/admin/entradas/transferencias` junta todos). Usa las mismas funciones que la
 * página de cada evento (`confirmTransfer` y `cancelTransfer` de orders.js, idempotentes) y
 * deja el mismo registro de actividad (`transfer.confirm` / `transfer.cancel`).
 *
 * Quien llama ya hizo `requireAdmin`: acá se recibe el login de le admin.
 */
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { cancelTransfer, confirmTransfer, getOrder } from '$lib/server/tickets/orders.js';
import { orderReference } from '$lib/utils/tickets.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */
/** @typedef {import('$lib/server/tickets/orders.js').Ticket} Ticket */

/**
 * @typedef {{ ok: boolean, status: number, message: string, order?: Order | null,
 *   tickets?: Ticket[], slug?: string }} TransferActionResult
 */

/**
 * Confirma el pago de una transferencia: aprueba, emite las entradas y registra quién. Quien
 * llama manda el mail con `sendMail` (así los tests no dependen de Resend).
 *
 * @param {{
 *   db: D1Database,
 *   locals: App.Locals,
 *   by: string,
 *   orderId: string,
 *   sendMail?: (order: Order, tickets: Ticket[]) => Promise<unknown>,
 *   now?: number
 * }} input
 * @returns {Promise<TransferActionResult>}
 */
export async function confirmTransferFromPanel({ db, locals, by, orderId, sendMail, now }) {
	const order = await getOrder(db, orderId);
	if (!order || order.payment_method !== 'transferencia') {
		return { ok: false, status: 404, message: 'No encontramos esa transferencia.' };
	}
	const ref = orderReference(order.id);
	const config = await getEventTickets(order.event_slug);
	const type = config?.types.find((t) => t.id === order.ticket_type);
	if (!type) {
		return {
			ok: false,
			status: 404,
			message: `No encontramos el tipo de entrada de ${ref} (¿el evento dejó de vender entradas?).`
		};
	}
	const r = await confirmTransfer(db, {
		orderId: order.id,
		eventSlug: order.event_slug,
		capacity: type.capacity,
		by,
		...(now ? { now } : {})
	});
	if (r.result === 'confirmed' && r.order) {
		await logAdminAction(db, locals, {
			action: 'transfer.confirm',
			targetType: 'order',
			targetId: order.id,
			summary: `Confirmó la transferencia ${ref} (${r.tickets.length} entradas)`,
			detail: { event: order.event_slug, tickets: r.tickets.length, total: r.order.total }
		});
		if (sendMail) await sendMail(r.order, r.tickets);
		return {
			ok: true,
			status: 200,
			slug: order.event_slug,
			order: r.order,
			tickets: r.tickets,
			message: `Pago de ${ref} confirmado: se emitieron ${r.tickets.length} entradas y se mandaron a ${r.order.buyer_email}.`
		};
	}
	if (r.result === 'already') {
		return {
			ok: true,
			status: 200,
			message: `${ref} ya estaba confirmada (no se emitió nada de nuevo).`
		};
	}
	/** @type {Record<string, string>} */
	const messages = {
		'no-capacity': `No se pudo confirmar ${ref}: la reserva venció y ya no hay cupo para ${order.quantity} entradas ${type.name}.`,
		'not-transfer': `${ref} no es una compra por transferencia.`,
		'not-found': 'No encontramos esa orden.',
		cancelled: `${ref} está cancelada: no se puede confirmar.`
	};
	return { ok: false, status: 409, message: messages[r.result] ?? `No se pudo confirmar ${ref}.` };
}

/**
 * Cancela una transferencia que no llegó (libera el cupo y el uso del código).
 *
 * @param {{ db: D1Database, locals: App.Locals, by: string, orderId: string, now?: number }} input
 * @returns {Promise<TransferActionResult>}
 */
export async function cancelTransferFromPanel({ db, locals, by, orderId, now }) {
	const order = await getOrder(db, orderId);
	if (!order || order.payment_method !== 'transferencia') {
		return { ok: false, status: 404, message: 'No encontramos esa transferencia.' };
	}
	const ref = orderReference(order.id);
	const ok = await cancelTransfer(db, {
		orderId: order.id,
		eventSlug: order.event_slug,
		by,
		...(now ? { now } : {})
	});
	if (!ok) return { ok: false, status: 409, message: `No se pudo cancelar ${ref}.` };
	await logAdminAction(db, locals, {
		action: 'transfer.cancel',
		targetType: 'order',
		targetId: order.id,
		summary: `Canceló la transferencia ${ref}`,
		detail: { event: order.event_slug }
	});
	return { ok: true, status: 200, message: `${ref} cancelada: se liberó el cupo.` };
}

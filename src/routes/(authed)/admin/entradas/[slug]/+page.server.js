import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { inBackground, sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import {
	cancelTransfer,
	confirmTransfer,
	getCounts,
	getOrder,
	listEventTickets,
	listOrders,
	orderHolders
} from '$lib/server/tickets/orders.js';
import { orderReference } from '$lib/utils/tickets.js';

/** Transferencias vencidas que se siguen mostrando (por si el pago llega tarde). */
const EXPIRED_TRANSFER_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const now = Date.now();
	const [orders, counts, tickets] = await Promise.all([
		listOrders(db, params.slug),
		getCounts(db, params.slug, now),
		listEventTickets(db, params.slug)
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
		holders:
			holdersByOrder.get(o.id) ??
			(o.holders ? orderHolders(o).map((h) => ({ ...h, checkedIn: false })) : [])
	}));
	return {
		slug: params.slug,
		title: config.title,
		types: config.types.map((t) => ({
			...t,
			sold: counts.get(t.id)?.sold ?? 0,
			held: counts.get(t.id)?.held ?? 0,
			revenue: counts.get(t.id)?.revenue ?? 0,
			fondoUsed: counts.get(t.id)?.fondo ?? 0,
			contribution: counts.get(t.id)?.contribution ?? 0,
			surcharge: counts.get(t.id)?.surcharge ?? 0
		})),
		transfers: rows.filter(
			(o) =>
				o.method === 'transferencia' &&
				(o.status === 'awaiting_transfer' ||
					(o.status === 'expired' && o.expiresAt > now - EXPIRED_TRANSFER_VISIBLE_MS))
		),
		orders: rows
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	resend: async ({ locals, url, params, platform, request, fetch }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { resend: { ok: false, message: 'Sin base de datos.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const order = await getOrder(db, orderId);
		if (!order || order.event_slug !== params.slug || order.status !== 'approved') {
			return fail(400, { resend: { ok: false, message: 'Esa orden no está aprobada.' } });
		}
		const sent = await sendOrderEmail({
			db,
			order,
			origin: siteOrigin(url),
			fetch,
			idempotent: false
		});
		return {
			resend: {
				ok: sent,
				message: sent
					? `Reenviamos las entradas a ${order.buyer_email}.`
					: 'No se pudo mandar el email (ver logs).'
			}
		};
	},

	// "Confirmar pago" de una transferencia: aprueba, emite las entradas y manda el mail.
	// Idempotente: un segundo click no emite ni manda nada de nuevo.
	confirm: async ({ locals, url, params, platform, request, fetch }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		if (!config) return fail(404, { transfer: { ok: false, message: 'Evento no encontrado.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const order = await getOrder(db, orderId);
		const type = config.types.find((t) => t.id === order?.ticket_type);
		if (!order || !type) {
			return fail(404, { transfer: { ok: false, message: 'No encontramos esa orden.' } });
		}
		const r = await confirmTransfer(db, {
			orderId,
			eventSlug: params.slug,
			capacity: type.capacity,
			by: admin.login
		});
		const ref = orderReference(orderId);
		if (r.result === 'confirmed' && r.order) {
			const confirmed = r.order;
			await inBackground(
				sendOrderEmail({
					db,
					order: confirmed,
					tickets: r.tickets,
					origin: siteOrigin(url),
					fetch
				}),
				platform
			);
			return {
				transfer: {
					ok: true,
					message: `Pago de ${ref} confirmado: se emitieron ${r.tickets.length} entradas y se mandaron a ${confirmed.buyer_email}.`
				}
			};
		}
		/** @type {Record<string, string>} */
		const messages = {
			already: `${ref} ya estaba confirmada (no se emitió nada de nuevo).`,
			'no-capacity': `No se pudo confirmar ${ref}: la reserva venció y ya no hay cupo para ${r.order?.quantity ?? ''} entradas ${type.name}.`,
			'not-transfer': `${ref} no es una compra por transferencia.`,
			'not-found': 'No encontramos esa orden.',
			cancelled: `${ref} está cancelada: no se puede confirmar.`
		};
		if (r.result === 'already') return { transfer: { ok: true, message: messages.already } };
		return fail(409, { transfer: { ok: false, message: messages[r.result] } });
	},

	cancel: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const ok = await cancelTransfer(db, { orderId, eventSlug: params.slug, by: admin.login });
		const ref = orderReference(orderId);
		return ok
			? { transfer: { ok: true, message: `${ref} cancelada: se liberó el cupo.` } }
			: fail(409, { transfer: { ok: false, message: `No se pudo cancelar ${ref}.` } });
	}
};

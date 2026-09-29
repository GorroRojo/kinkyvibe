import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import {
	inBackground,
	sendOrderEmail,
	sendStreamLinkEmails,
	siteOrigin
} from '$lib/server/tickets/index.js';
import {
	cancelTransfer,
	confirmTransfer,
	getCounts,
	getOrder,
	listEventTickets,
	listOrders,
	orderHolders
} from '$lib/server/tickets/orders.js';
import {
	getStreamLink,
	normalizeStreamLink,
	setStreamLink,
	streamLinkRecipients
} from '$lib/server/tickets/stream.js';
import { orderReference } from '$lib/utils/tickets.js';

/** Transferencias vencidas que se siguen mostrando (por si el pago llega tarde). */
const EXPIRED_TRANSFER_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders, fetch }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const db = getDB(platform);
	const fondo = await resolveFondoPercent({ db, fetch });
	const config = await getEventTickets(params.slug, { fondoPercent: fondo.percent });
	if (!config) error(404, 'Ese evento no vende entradas.');
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
		holders:
			holdersByOrder.get(o.id) ??
			(o.holders ? orderHolders(o).map((h) => ({ ...h, checkedIn: false })) : [])
	}));
	// Eventos online: link de la transmisión (en D1, nunca en el repo) y a cuántas personas les
	// falta recibirlo.
	/** @type {{ link: string | null, updatedAt: number | null, updatedBy: string | null, pending: number, approvedOrders: number } | null} */
	let stream = null;
	if (config.online) {
		const current = await getStreamLink(db, params.slug);
		stream = {
			link: current?.link ?? null,
			updatedAt: current?.updatedAt ?? null,
			updatedBy: current?.updatedBy ?? null,
			pending: current ? (await streamLinkRecipients(db, params.slug, current.link)).length : 0,
			approvedOrders: orders.filter((o) => o.status === 'approved').length
		};
	}
	return {
		slug: params.slug,
		title: config.title,
		online: config.online,
		stream,
		types: config.types.map((t) => ({
			...t,
			sold: counts.get(t.id)?.sold ?? 0,
			held: counts.get(t.id)?.held ?? 0,
			revenue: counts.get(t.id)?.revenue ?? 0,
			fondoUsed: counts.get(t.id)?.fondo ?? 0,
			contribution: counts.get(t.id)?.contribution ?? 0,
			fondoNet: (counts.get(t.id)?.contribution ?? 0) - (counts.get(t.id)?.fondo ?? 0),
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

	// "Link de la transmisión" (eventos online): guardar o borrar.
	setLink: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { stream: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		if (!config?.online) {
			return fail(400, { stream: { ok: false, message: 'Este evento no es online.' } });
		}
		const raw = String((await request.formData()).get('link') ?? '').slice(0, 1000);
		const r = normalizeStreamLink(raw);
		if (!r.ok) return fail(400, { stream: { ok: false, message: r.message, value: raw } });
		await setStreamLink(db, { eventSlug: params.slug, link: r.link, by: admin.login });
		return {
			stream: {
				ok: true,
				message: r.link
					? 'Link guardado. Las compras nuevas lo reciben en el mail de las entradas; para quienes ya compraron, tocá "Enviar el link a todes".'
					: 'Link borrado.'
			}
		};
	},

	// "Enviar el link a todes": solo a las órdenes aprobadas que todavía no recibieron ESTE link.
	sendLink: async ({ locals, url, params, platform, fetch }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { stream: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		const current = config?.online ? await getStreamLink(db, params.slug) : null;
		if (!current) {
			return fail(400, { stream: { ok: false, message: 'Primero guardá el link.' } });
		}
		const r = await sendStreamLinkEmails({
			db,
			eventSlug: params.slug,
			link: current.link,
			origin: siteOrigin(url),
			fetch
		});
		const who = (/** @type {number} */ n) => (n === 1 ? '1 persona' : `${n} personas`);
		const message =
			r.sent === 0 && r.failed === 0
				? 'Todes ya tenían este link: no se mandó nada.'
				: `Link enviado a ${who(r.sent)}.` +
					(r.failed
						? ` No se pudo mandar a ${who(r.failed)} (ver logs; volvé a tocar el botón).`
						: '');
		return r.failed
			? fail(502, { stream: { ok: false, message } })
			: { stream: { ok: true, message } };
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

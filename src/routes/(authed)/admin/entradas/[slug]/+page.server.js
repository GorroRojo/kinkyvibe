import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { sendOrderEmail, siteOrigin } from '$lib/server/tickets/index.js';
import { getCounts, getOrder, listOrders } from '$lib/server/tickets/orders.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const [orders, counts] = await Promise.all([
		listOrders(db, params.slug),
		getCounts(db, params.slug)
	]);
	const names = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	return {
		slug: params.slug,
		title: config.title,
		types: config.types.map((t) => ({
			...t,
			sold: counts.get(t.id)?.sold ?? 0,
			held: counts.get(t.id)?.held ?? 0,
			revenue: counts.get(t.id)?.revenue ?? 0
		})),
		orders: orders.map((o) => ({
			id: o.id,
			name: o.buyer_name,
			email: o.buyer_email,
			type: names[o.ticket_type] ?? o.ticket_type,
			quantity: o.quantity,
			total: o.total,
			status: o.status,
			checkedIn: o.checked_in,
			emailSent: Boolean(o.email_sent_at),
			createdAt: o.created_at,
			paymentId: o.mp_payment_id
		}))
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
	}
};

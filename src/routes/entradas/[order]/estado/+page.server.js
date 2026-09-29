/**
 * Página de vuelta de Mercado Pago (back_urls). El webhook puede llegar tarde, así que si la
 * orden sigue sin aprobar se vuelve a consultar el pago a la API de MP, igual que el webhook:
 * los parámetros de la URL solo dicen QUÉ pago consultar, nunca su estado.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { rememberedOrders } from '$lib/server/tickets/checkout.js';
import { maskEmail } from '$lib/server/tickets/email.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	getGateway,
	processPayment,
	replyToAddress,
	siteOrigin,
	transferInfo
} from '$lib/server/tickets/index.js';
import { holdHours, orderReference } from '$lib/utils/tickets.js';
import { getOrder, getOrderTickets, isValidOrderId } from '$lib/server/tickets/orders.js';

const RECHECK_LIMIT = { limit: 10, windowSeconds: 60 };

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, url, platform, fetch, cookies }) {
	if (!isValidOrderId(params.order)) error(404, 'No encontramos esa compra.');
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	let order = await getOrder(db, params.order);
	if (!order) error(404, 'No encontramos esa compra.');

	if (
		order.payment_method === 'mercadopago' &&
		order.status !== 'approved' &&
		order.status !== 'refunded' &&
		order.mp_preference_id
	) {
		try {
			const limit = await hitRateLimit(db, `tickets:o:${order.id}`, RECHECK_LIMIT);
			const gateway = limit.allowed ? await getGateway(fetch) : null;
			if (gateway) {
				const paymentId =
					url.searchParams.get('payment_id') ?? url.searchParams.get('collection_id');
				const payment =
					paymentId && /^\d{1,30}$/.test(paymentId)
						? await gateway.getPayment(paymentId)
						: await gateway.findPaymentByOrder(order.id);
				if (payment && String(payment.external_reference) === order.id) {
					const result = await processPayment({
						db,
						payment,
						origin: siteOrigin(url),
						fetch,
						platform
					});
					if (result.order) order = result.order;
				}
			}
		} catch (e) {
			// Si MP no responde mostramos el estado que tenemos; el webhook lo va a actualizar.
			console.error('[tickets] no se pudo re-chequear el pago:', e);
		}
	}

	const current = order;
	const config = await getEventTickets(current.event_slug);
	const mine = rememberedOrders(cookies).includes(current.id);
	const tickets =
		mine && current.status === 'approved'
			? (await getOrderTickets(db, current.id)).map((t) => ({ token: t.token }))
			: [];
	return {
		order: {
			id: current.id,
			status: current.status,
			quantity: current.quantity,
			list: current.unit_price * current.quantity,
			fondo: current.fondo_amount,
			fondoOption: current.fondo_option,
			contribution: current.fondo_contribution,
			holdHours: holdHours(current),
			discountCode: current.discount_code,
			discountAmount: current.discount_amount,
			surcharge: current.surcharge_amount,
			total: current.total,
			method: current.payment_method,
			reference: orderReference(current.id),
			typeName:
				config?.types.find((t) => t.id === current.ticket_type)?.name ?? current.ticket_type,
			// Sin la cookie de esta compra no mostramos el email completo.
			email: mine ? current.buyer_email : maskEmail(current.buyer_email),
			expiresAt: current.expires_at
		},
		event: {
			slug: current.event_slug,
			title: config?.title ?? current.event_slug
		},
		tickets,
		// Datos para transferir: solo mientras se espera la transferencia.
		transfer:
			current.status === 'awaiting_transfer'
				? { info: transferInfo(), replyTo: replyToAddress() ?? null }
				: null
	};
}

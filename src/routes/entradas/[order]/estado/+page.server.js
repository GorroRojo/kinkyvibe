/**
 * Página de vuelta de Mercado Pago (back_urls). El webhook puede llegar tarde, así que si la
 * orden sigue sin aprobar se vuelve a consultar el pago a la API de MP, igual que el webhook:
 * los parámetros de la URL solo dicen QUÉ pago consultar, nunca su estado.
 */
import { orderPaid } from '$lib/utils/extras.js';
import { orderExtras } from '$lib/server/tickets/extras.js';
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
import { orderReference } from '$lib/utils/tickets.js';
import { getOrder, getOrderTickets, isValidOrderId } from '$lib/server/tickets/orders.js';
import { workshopPartsList } from '$lib/server/tickets/workshopParts.js';
import { getPaypalGateway } from '$lib/server/paypal/gateway.js';
import { settleAndProcess } from '$lib/server/paypal/process.js';

const RECHECK_LIMIT = { limit: 10, windowSeconds: 60 };

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, url, platform, fetch, cookies, depends }) {
	// El sondeo de la página (+page.svelte) recarga solo esto, no el layout (ver `pollDelays`).
	depends('kv:orden');
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

	// PayPal (docs/paypal.md): si la vuelta no llegó a cobrar o el webhook tarda, se mira la orden de
	// PayPal (y se cobra si ya está aprobada), igual que el webhook.
	if (
		order.payment_method === 'paypal' &&
		order.status !== 'approved' &&
		order.status !== 'refunded' &&
		order.paypal_order_id
	) {
		try {
			const limit = await hitRateLimit(db, `tickets:o:${order.id}`, RECHECK_LIMIT);
			const gateway = limit.allowed ? await getPaypalGateway(fetch) : null;
			if (gateway) {
				await settleAndProcess({
					db,
					gateway,
					paypalOrderId: order.paypal_order_id,
					origin: siteOrigin(url),
					fetch,
					platform
				});
				order = (await getOrder(db, order.id)) ?? order;
			}
		} catch (e) {
			console.error('[tickets] no se pudo re-chequear el pago de PayPal:', e);
		}
	}

	const current = order;
	// Lo que sigue no depende entre sí (o solo de la cookie): va todo junto, en vez de una ida y
	// vuelta a D1 por consulta. Las entradas esperan solo a la cookie; las partes, además, a la
	// ficha del evento (si es online).
	const configP = getEventTickets(current.event_slug);
	const mineP = rememberedOrders(db, cookies).then((ids) => ids.includes(current.id));
	const [config, mine, tickets, parts, transfer, extras] = await Promise.all([
		configP,
		mineP,
		mineP.then(async (mine) =>
			mine && current.status === 'approved'
				? (await getOrderTickets(db, current.id)).map((t) => ({ token: t.token }))
				: []
		),
		Promise.all([configP, mineP]).then(([config, mine]) =>
			// Taller en varias partes con una sola entrada: la fecha (y el lugar) de cada parte, como
			// en los mails y en la página de cada entrada (docs/talleres-partes.md). El lugar completo
			// solo para quien hizo esta compra y ya está aprobada; si no, el que se ve en el sitio.
			workshopPartsList(db, current.event_slug, {
				online: Boolean(config?.online),
				buyer: mine && current.status === 'approved'
			})
		),
		// Datos para transferir: solo mientras se espera la transferencia.
		current.status === 'awaiting_transfer'
			? Promise.all([transferInfo(db), replyToAddress(db)]).then(([info, replyTo]) => ({
					info,
					replyTo
				}))
			: null,
		// Extras de la compra (decisión 0056): solo si la orden tiene (sin leer la tabla si no).
		Number(current.extras_amount ?? 0) > 0 ? orderExtras(db, current.id) : []
	]);
	const online = Boolean(config?.online);
	return {
		order: {
			id: current.id,
			status: current.status,
			quantity: current.quantity,
			list: current.unit_price * current.quantity,
			fondo: current.fondo_amount,
			fondoOption: current.fondo_option,
			unitPrice: current.unit_price,
			contribution: current.fondo_contribution,
			discountCode: current.discount_code,
			discountAmount: current.discount_amount,
			surcharge: current.surcharge_amount,
			// Lo que se paga en total: las entradas y los extras (`orderPaid`).
			total: orderPaid(current),
			extras: extras.map((e) => ({ name: e.name, quantity: e.quantity, price: e.price })),
			method: current.payment_method,
			// Lo que se cobró en dólares (solo PayPal).
			usdCents: current.payment_method === 'paypal' ? (current.usd_amount_cents ?? null) : null,
			// Quien compraba canceló en PayPal (o no se llegó a crear el pago): no se cobró nada. Una
			// cancelación del panel guarda quién la hizo (`confirmed_by`).
			paypalCancelled:
				current.payment_method === 'paypal' &&
				current.status === 'cancelled' &&
				!current.paypal_capture_id &&
				!current.confirmed_by,
			reference: orderReference(current.id),
			typeName:
				config?.types.find((t) => t.id === current.ticket_type)?.name ?? current.ticket_type,
			// Sin la cookie de esta compra no mostramos el email completo.
			email: mine ? current.buyer_email : maskEmail(current.buyer_email),
			expiresAt: current.expires_at,
			// Transferencia que sigue esperando pero ya pasó su vencimiento (todavía no se marcó vencida).
			holdExpired: current.status === 'awaiting_transfer' && current.expires_at <= Date.now()
		},
		event: {
			slug: current.event_slug,
			title: config?.title ?? current.event_slug,
			online,
			parts
		},
		tickets,
		transfer
	};
}

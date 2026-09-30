/**
 * DEV ONLY: checkout de Mercado Pago simulado. En producción (`dev === false`) responde 404 y el
 * módulo del mock no se incluye en el build.
 *
 * Simula lo que hace MP: crea un pago, manda la notificación firmada al webhook (igual que MP,
 * con `?data.id=…&type=payment`, `x-signature` y `x-request-id`) y redirige a la back_url con
 * los mismos parámetros que agrega MP.
 */
import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { isMpMock, webhookSecret } from '$lib/server/tickets/index.js';
import { signWebhook } from '$lib/server/tickets/mercadopago.js';
import { getOrder } from '$lib/server/tickets/orders.js';

async function loadMock() {
	// Con `dev` constante `false` en el build, el import desaparece del bundle de producción.
	if (dev && isMpMock()) return await import('$lib/server/tickets/mock.js');
	error(404, 'Not found');
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform }) {
	const { getMockPreference } = await loadMock();
	const db = getDB(platform);
	const order = db ? await getOrder(db, params.order) : null;
	const preference = getMockPreference(params.order);
	if (!order || !preference) error(404, 'No hay un pago simulado para esa orden.');
	return {
		order: {
			id: order.id,
			status: order.status,
			total: order.total,
			email: order.buyer_email,
			expiresAt: order.expires_at
		},
		item: preference.items[0]
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, request, fetch }) => {
		const { createMockPayment, getMockPreference } = await loadMock();
		const preference = getMockPreference(params.order);
		if (!preference) error(404, 'No hay un pago simulado para esa orden.');
		const form = await request.formData();
		const outcome = String(form.get('outcome'));
		const status =
			outcome === 'approved' || outcome === 'late'
				? 'approved'
				: outcome === 'rejected'
					? 'rejected'
					: 'in_process';
		const payment = createMockPayment(params.order, status);
		const dataId = String(payment.id);

		// "late" simula un webhook demorado: la página de estado tiene que re-chequear sola.
		if (outcome !== 'late') {
			const requestId = crypto.randomUUID();
			const secret = /** @type {string} */ (webhookSecret());
			const res = await fetch(`/api/mercadopago/webhook?data.id=${dataId}&type=payment`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-request-id': requestId,
					'x-signature': await signWebhook({ dataId, requestId, secret })
				},
				body: JSON.stringify({
					action: 'payment.created',
					api_version: 'v1',
					data: { id: dataId },
					date_created: new Date().toISOString(),
					id: Date.now(),
					live_mode: false,
					type: 'payment',
					user_id: '0'
				})
			});
			console.log(`[mp:simulado] webhook pago ${dataId} (${status}) → ${res.status}`);
		}

		const back = new URL(
			status === 'approved'
				? preference.back_urls.success
				: status === 'rejected'
					? preference.back_urls.failure
					: preference.back_urls.pending
		);
		const params2 = {
			collection_id: dataId,
			collection_status: status,
			payment_id: dataId,
			status,
			external_reference: params.order,
			payment_type: 'credit_card',
			merchant_order_id: 'null',
			preference_id: preference.id,
			site_id: 'MLA',
			processing_mode: 'aggregator',
			merchant_account_id: 'null'
		};
		for (const [k, v] of Object.entries(params2)) back.searchParams.set(k, v);
		redirect(303, back.pathname + back.search);
	}
};

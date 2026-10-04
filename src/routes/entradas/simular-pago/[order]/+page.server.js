/**
 * DEV ONLY: checkout de Mercado Pago simulado. En producción (`dev === false`) responde 404 y el
 * módulo del mock no se incluye en el build.
 *
 * Simula lo que hace MP (`completeMockCheckout` de tickets/mock.js): crea un pago, manda la
 * notificación firmada al webhook y redirige a la back_url con los parámetros que agrega MP.
 */
import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { isMpMock, webhookSecret } from '$lib/server/tickets/index.js';
import { itemDetail } from '$lib/server/tickets/mercadopago.js';
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
		// La cantidad una sola vez (en las órdenes de un solo ítem ya viene en el título).
		detail: itemDetail(preference.items[0])
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, request, fetch }) => {
		const { completeMockCheckout, getMockPreference } = await loadMock();
		if (!getMockPreference(params.order)) error(404, 'No hay un pago simulado para esa orden.');
		const form = await request.formData();
		const location = await completeMockCheckout({
			reference: params.order,
			outcome: String(form.get('outcome')),
			fetch,
			secret: /** @type {string} */ (webhookSecret())
		});
		redirect(303, location);
	}
};

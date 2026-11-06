/**
 * DEV ONLY: la pantalla de aprobación de PayPal simulada (`PAYPAL_MOCK=1`, docs/paypal.md). En
 * producción (`dev === false`) responde 404 y el módulo del simulado no se incluye en el build.
 *
 * Aprobar vuelve a la `return_url` con `?token=<orden>&PayerID=…`, como PayPal; cancelar, a la
 * `cancel_url`. La vuelta (/paypal/vuelta) cobra y aplica el pago.
 */
import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { isPaypalMock } from '$lib/server/paypal/gateway.js';

async function loadMock() {
	if (dev && isPaypalMock()) return await import('$lib/server/paypal/mock.js');
	error(404, 'Not found');
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const { getMockPaypalOrder } = await loadMock();
	const order = getMockPaypalOrder(params.id);
	if (!order) error(404, 'No hay un pago de PayPal simulado con ese id.');
	const unit = order.purchase_units[0];
	return {
		id: order.id,
		status: String(order.status),
		value: String(unit.amount.value),
		description: String(unit.description ?? '')
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, request }) => {
		const { decideMockPaypalOrder, getMockPaypalOrder } = await loadMock();
		if (!getMockPaypalOrder(params.id)) error(404, 'No hay un pago de PayPal simulado.');
		const form = await request.formData();
		const action = form.get('outcome') === 'approve' ? 'approve' : 'cancel';
		redirect(303, decideMockPaypalOrder(params.id, action));
	}
};

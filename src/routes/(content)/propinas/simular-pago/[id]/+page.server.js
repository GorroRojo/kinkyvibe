/**
 * DEV ONLY: checkout de Mercado Pago simulado para una propina, igual que el de las entradas
 * (/entradas/simular-pago/<orden>, con `completeMockCheckout`). En producción (`dev === false`)
 * responde 404 y el módulo del mock no se incluye en el build.
 */
import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { getTip, tipReference } from '$lib/server/propinas/index.js';
import { isMpMock, webhookSecret } from '$lib/server/tickets/index.js';

async function loadMock() {
	if (dev && isMpMock()) return await import('$lib/server/tickets/mock.js');
	error(404, 'Not found');
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform }) {
	const { getMockPreference } = await loadMock();
	const db = getDB(platform);
	const tip = db ? await getTip(db, params.id) : null;
	const preference = getMockPreference(tipReference(params.id));
	if (!tip || !preference) error(404, 'No hay un pago simulado para esa propina.');
	return { tip: { id: tip.id, amount: tip.amount }, item: preference.items[0] };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, request, fetch }) => {
		const { completeMockCheckout, getMockPreference } = await loadMock();
		const reference = tipReference(params.id);
		if (!getMockPreference(reference)) error(404, 'No hay un pago simulado para esa propina.');
		const form = await request.formData();
		const location = await completeMockCheckout({
			reference,
			outcome: String(form.get('outcome')),
			fetch,
			secret: /** @type {string} */ (webhookSecret())
		});
		redirect(303, location);
	}
};

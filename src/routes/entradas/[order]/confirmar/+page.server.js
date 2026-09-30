/**
 * Confirmar una reserva por transferencia desde el link del mail: la reserva inicial (corta) pasa
 * a durar lo completo (TICKETS_TRANSFER_HOLD_HOURS). El link lleva una firma (`k`); abrirlo solo
 * muestra el botón (los lectores de mail que abren links no confirman nada), confirmar es un POST.
 */
import { error, fail } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { transferHoldMs } from '$lib/server/tickets/index.js';
import { extendTransferHold, getOrder, isValidOrderId } from '$lib/server/tickets/orders.js';
import { verifyConfirmToken } from '$lib/server/tickets/safeguards.js';

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} id
 * @param {unknown} token
 */
async function checkedOrder(db, id, token) {
	if (!isValidOrderId(id) || !(await verifyConfirmToken(db, id, token))) {
		error(404, 'Este link no es válido. Revisá el último mail que te mandamos.');
	}
	const order = await getOrder(db, id);
	if (!order) error(404, 'No encontramos esa compra.');
	return order;
}

/** @param {import('$lib/server/tickets/orders.js').Order} order @param {number} [now] */
function view(order, now = Date.now()) {
	const fullUntil = order.created_at + transferHoldMs();
	return {
		id: order.id,
		status: order.status,
		expiresAt: order.expires_at,
		confirmed: order.expires_at >= fullUntil,
		expired: order.status !== 'awaiting_transfer' || order.expires_at <= now,
		fullHours: Math.round(transferHoldMs() / 3600000)
	};
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, url, platform }) {
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	const k = url.searchParams.get('k') ?? '';
	const order = await checkedOrder(db, params.order, k);
	return { order: view(order), k };
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async ({ params, request, platform }) => {
		const db = getDB(platform);
		if (!db) return fail(503, { error: 'No disponible en este momento.' });
		const k = String((await request.formData()).get('k') ?? '');
		const order = await checkedOrder(db, params.order, k);
		const extended = await extendTransferHold(db, order.id, transferHoldMs());
		if (!extended)
			return fail(409, {
				error:
					'La reserva ya no está vigente: si ya transferiste, respondé el mail con el comprobante.'
			});
		return { confirmed: true, order: view(extended) };
	}
};

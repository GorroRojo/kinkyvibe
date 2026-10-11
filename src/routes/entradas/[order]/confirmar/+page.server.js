/**
 * Links «Confirmar mi reserva» de los mails de transferencia viejos. El paso de confirmar ya no
 * existe (decisión 0031: la reserva dura desde el principio hasta las 20:00 del segundo día
 * hábil), pero esos links siguen andando: muestran hasta cuándo está guardada la reserva (o que
 * ya venció) y no cambian nada. El link lleva su firma (`k`), como antes.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { getOrder, isValidOrderId } from '$lib/server/tickets/orders.js';
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

/**
 * Qué se muestra: `held` (sigue guardada, hasta `expiresAt`), `paid` (ya se confirmó el pago) o
 * `expired` (venció o ya no está vigente por otra razón).
 *
 * @param {import('$lib/server/tickets/orders.js').Order} order
 * @param {number} [now]
 */
function confirmView(order, now = Date.now()) {
	/** @type {'held' | 'paid' | 'expired'} */
	const state =
		order.status === 'approved'
			? 'paid'
			: order.status === 'awaiting_transfer' && order.expires_at > now
				? 'held'
				: 'expired';
	return { id: order.id, state, expiresAt: order.expires_at };
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, url, platform }) {
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	const order = await checkedOrder(db, params.order, url.searchParams.get('k') ?? '');
	return { order: confirmView(order) };
}

/**
 * Una pestaña vieja con el botón «Confirmar mi reserva» todavía puede mandar el formulario: no
 * cambia nada, muestra lo mismo que la página.
 *
 * @type {import('./$types').Actions}
 */
export const actions = {
	default: async ({ params, request, platform }) => {
		const db = getDB(platform);
		if (!db) error(503, 'No disponible en este momento.');
		const k = String((await request.formData()).get('k') ?? '');
		const order = await checkedOrder(db, params.order, k);
		return { order: confirmView(order) };
	}
};

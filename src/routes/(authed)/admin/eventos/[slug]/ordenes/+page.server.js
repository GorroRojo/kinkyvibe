/**
 * Ficha del evento, pestaña Órdenes: todas las órdenes con sus entradas, reenviar el mail,
 * reembolsar (en dos pasos) y marcar como revisadas las que quedaron para revisar a mano.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { pickActions } from '$lib/server/admin/eventActions.js';
import { eventOrderRows } from '$lib/server/admin/eventOrders.js';
import { getEventTickets } from '$lib/server/tickets/events.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const { rows } = await eventOrderRows(db, params.slug, config);
	return {
		orders: rows,
		// Órdenes para revisar a mano (pago tardío sin cupo, pago duplicado).
		review: rows.filter((r) => r.needsReview)
	};
}

export const actions = pickActions('reviewed', 'resend', 'refund');

/**
 * Ficha del evento, pestaña Transferencias: confirmar el pago (emite y manda las entradas) o
 * cancelar la reserva. Se siguen mostrando 7 días las reservas vencidas.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { pickActions } from '$lib/server/admin/eventActions.js';
import { eventOrderRows, pendingTransfers } from '$lib/server/admin/eventOrders.js';
import { getEventTickets } from '$lib/server/tickets/events.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const now = Date.now();
	const { rows } = await eventOrderRows(db, params.slug, config, now);
	// Las últimas transferencias ya resueltas (confirmadas o canceladas), para tener a mano.
	const resolved = rows
		.filter(
			(o) =>
				o.method === 'transferencia' &&
				o.confirmedBy &&
				(o.status === 'approved' || o.status === 'cancelled')
		)
		.slice(0, 10);
	return { transfers: pendingTransfers(rows, now), resolved };
}

export const actions = pickActions('confirm', 'cancel');

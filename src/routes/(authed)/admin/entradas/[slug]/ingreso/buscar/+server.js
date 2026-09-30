/**
 * Sugerencias del buscador del control de ingreso (autocompletar mientras se escribe): JSON con
 * las entradas que coinciden por nombre, pronombres, quien compró, email, DNI o código, y con qué
 * campo coincidió. Solo admins (los `+server.js` no pasan por el layout: se chequea acá) y solo
 * datos que une admin ya ve en la lista de órdenes.
 */
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { searchRows } from '$lib/server/tickets/checkin.js';
import { searchTickets } from '$lib/server/tickets/orders.js';

/** Cuántas sugerencias como máximo. */
const LIMIT = 8;

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, params, platform }) {
	requireAdmin(locals, url);
	const config = await getEventTickets(params.slug);
	if (!config) error(404, 'Ese evento no vende entradas.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const names = Object.fromEntries(config.types.map((t) => [t.id, t.name]));
	const results =
		q.length >= 2
			? searchRows(await searchTickets(db, params.slug, q, { limit: LIMIT }), names)
			: [];
	return json(
		{ q, results },
		{ headers: { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' } }
	);
}

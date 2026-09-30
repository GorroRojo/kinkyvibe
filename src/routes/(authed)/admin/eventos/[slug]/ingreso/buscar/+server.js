/**
 * Sugerencias del buscador del modo puerta ("Buscar persona", autocompletar mientras se
 * escribe): JSON con las entradas que coinciden por nombre, pronombres, quien compró, email, DNI
 * o código, y con qué campo coincidió. Solo admins (los `+server.js` no pasan por el layout: se
 * chequea acá) y solo datos que une admin ya ve en la lista de órdenes.
 */
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { searchRows } from '$lib/server/tickets/checkin.js';
import { searchTickets } from '$lib/server/tickets/orders.js';
import { NO_STORE, doorContext } from '../context.server.js';

/** Cuántas sugerencias como máximo. */
const LIMIT = 8;

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	requireAdmin(event.locals, event.url);
	const { db, typeNames } = await doorContext(event);
	const q = (event.url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const results =
		q.length >= 2
			? searchRows(await searchTickets(db, event.params.slug, q, { limit: LIMIT }), typeNames)
			: [];
	return json({ q, results }, { headers: NO_STORE });
}

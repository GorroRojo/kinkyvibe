/**
 * Lista de entradas del evento para validar sin conexión en el modo puerta (el celu la guarda en
 * localStorage). Solo admins. Lleva el hash del token (no el token) y los últimos 3 dígitos del
 * DNI (no el DNI): ver `offlineList` en $lib/server/tickets/door.js.
 */
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { doorCounts, offlineList } from '$lib/server/tickets/door.js';
import { NO_STORE, cachedPrior, doorContext } from '../context.server.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	requireAdmin(event.locals, event.url);
	const { db, typeNames } = await doorContext(event);
	const slug = event.params.slug;
	const prior = await cachedPrior(db, slug, event.platform);
	const [tickets, counts] = await Promise.all([
		offlineList(db, { slug, typeNames, prior }),
		doorCounts(db, slug)
	]);
	return json({ at: Date.now(), tickets, counts }, { headers: NO_STORE });
}

/**
 * Lista de entradas del evento para validar sin conexión en el modo puerta (el celu la guarda en
 * localStorage). Solo admins. Lleva el hash del token (no el token) y los últimos 3 dígitos del
 * DNI (no el DNI): ver `offlineList` en $lib/server/tickets/door.js.
 */
import { json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { doorCounts, offlineList } from '$lib/server/tickets/door.js';
import { overlayPartCheckins, partDoorCounts } from '$lib/server/tickets/partCheckins.js';
import { NO_STORE, cachedPrior, doorContext } from '../context.server.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	requireAdmin(event.locals, event.url);
	// En una parte de un taller (docs/talleres-partes.md): las entradas del taller con el ingreso
	// a esta parte.
	const { db, typeNames, ticketSlug: slug, part } = await doorContext(event);
	const prior = await cachedPrior(db, slug, event.platform);
	const [all, counts] = await Promise.all([
		offlineList(db, { slug, typeNames, prior }),
		part ? partDoorCounts(db, slug, part.slug) : doorCounts(db, slug)
	]);
	const tickets = part
		? await overlayPartCheckins(db, part.slug, all, { id: 'ticketId', at: 'at', by: 'by' })
		: all;
	return json({ at: Date.now(), tickets, counts }, { headers: NO_STORE });
}

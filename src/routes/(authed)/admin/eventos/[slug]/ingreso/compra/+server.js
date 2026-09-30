/**
 * Detalle completo de la compra de una entrada (hoja "Ver compra" del modo puerta): la orden,
 * cómo pagó, montos y todas sus entradas con su ingreso. Solo admins; sin el DNI completo (se
 * pide aparte con la acción `reveal`, que queda registrada).
 */
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { purchaseDetails } from '$lib/server/tickets/door.js';
import { NO_STORE, doorContext } from '../context.server.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	requireAdmin(event.locals, event.url);
	const { db, typeNames } = await doorContext(event);
	const ticketId = (event.url.searchParams.get('ticket') ?? '').slice(0, 64);
	const details = ticketId
		? await purchaseDetails(db, { slug: event.params.slug, ticketId, typeNames })
		: null;
	if (!details) error(404, 'No hay ninguna compra con esa entrada en este evento.');
	return json(details, { headers: NO_STORE });
}

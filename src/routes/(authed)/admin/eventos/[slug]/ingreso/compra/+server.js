/**
 * Detalle completo de la compra de una entrada (hoja "Ver compra" del modo puerta): la orden,
 * cómo pagó, montos y todas sus entradas con su ingreso. Solo admins; sin el DNI completo (se
 * pide aparte con la acción `reveal`, que queda registrada).
 */
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { purchaseDetails } from '$lib/server/tickets/door.js';
import { overlayPartCheckins } from '$lib/server/tickets/partCheckins.js';
import { NO_STORE, doorContext } from '../context.server.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	requireAdmin(event.locals, event.url);
	// En una parte de un taller: la compra del taller con el ingreso a esta parte.
	const { db, typeNames, ticketSlug, part } = await doorContext(event);
	const ticketId = (event.url.searchParams.get('ticket') ?? '').slice(0, 64);
	const details = ticketId
		? await purchaseDetails(db, { slug: ticketSlug, ticketId, typeNames })
		: null;
	if (!details) error(404, 'No hay ninguna compra con esa entrada en este evento.');
	if (part) {
		details.tickets = await overlayPartCheckins(db, part.slug, details.tickets, {
			id: 'id',
			at: 'at',
			by: 'by'
		});
	}
	return json(details, { headers: NO_STORE });
}

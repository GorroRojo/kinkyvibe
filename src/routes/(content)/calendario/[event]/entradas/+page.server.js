/**
 * Página de compra de entradas de un evento: /calendario/<slug>/entradas. Está separada de la
 * página del evento para que el formulario no empuje hacia abajo el texto del evento; la página
 * del evento muestra un botón "Comprar entradas" que trae acá.
 *
 * Los precios, cupos y medios de pago salen del servidor (`getTicketsView`, frontmatter + D1) y
 * las form actions vuelven a validar todo (ver $lib/server/tickets/checkout.js).
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { isValidEventSlug } from '$lib/server/tickets/events.js';
import { buyAction, discountAction, getTicketsView } from '$lib/server/tickets/checkout.js';
import { siteEvent } from '$lib/server/contenido/posts.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { eventPageVenue } from '$lib/server/amigues/venues.js';
import { stripMdPlace } from '$lib/utils/eventPlace.js';
import { purchaseAccount } from '$lib/server/cuentas/savedBuyer.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, fetch, locals, setHeaders }) {
	if (!isValidEventSlug(params.event)) error(404, 'Ese evento no existe.');
	// El encabezado sale del evento de la base (si no lo tiene, 404); la configuración de las
	// entradas, también (getTicketsView).
	const found = await siteEvent(platform, params.event, {
		viewer: viewerFor(locals),
		shallow: true,
		html: false
	});
	if (!found) error(404, 'Ese evento no existe.');
	const db = getDB(platform);
	const tickets = await getTicketsView(db, params.event, fetch);
	if (!tickets) error(404, 'Este evento no vende entradas por acá.');
	// Como en la página del evento: si tiene lugar, manda sobre el «Dónde» del evento.
	const venue = await eventPageVenue(db, params.event, locals);
	const event = { meta: venue ? stripMdPlace(found.meta) : found.meta, path: found.path };
	// Con cuenta (interruptor `cuentas`): nombre, pronombres, DNI guardados y el mail de la cuenta,
	// para completar «Tus datos». Es de esta persona: la página no se guarda en ningún caché.
	const account = tickets.open ? await purchaseAccount(db, locals.member) : null;
	if (account) setHeaders({ 'cache-control': 'private, no-store' });
	return { tickets, event, venue, account };
}

/** @type {import('./$types').Actions} */
export const actions = {
	buy: (event) => buyAction(event),
	discount: (event) => discountAction(event)
};

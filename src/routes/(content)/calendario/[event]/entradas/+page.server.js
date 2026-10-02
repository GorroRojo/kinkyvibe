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
import { eventPageVenue } from '$lib/server/amigues/venues.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, fetch, locals }) {
	if (!isValidEventSlug(params.event)) error(404, 'Ese evento no existe.');
	const db = getDB(platform);
	const tickets = await getTicketsView(db, params.event, fetch);
	if (!tickets) error(404, 'Este evento no vende entradas por acá.');
	// Como en la página del evento: si tiene lugar, manda sobre el «Dónde» del .md.
	return { tickets, venue: await eventPageVenue(db, params.event, locals) };
}

/** @type {import('./$types').Actions} */
export const actions = {
	buy: (event) => buyAction(event),
	discount: (event) => discountAction(event)
};

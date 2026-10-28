import { currentSitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { askVenuePlacesEarly, withVenuePlaces } from '$lib/server/amigues/venues.js';
import { askTicketStatesEarly, ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { carruselPortadaEnabled } from '$lib/server/flags.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	// La venta y los lugares de las tarjetas, a la par de la lista (con lo que ya tiene el isolate).
	askTicketStatesEarly(platform);
	askVenuePlacesEarly(getDB(platform));
	// El carrusel de arriba (interruptor `carrusel_portada`, apagado si no hay fila; docs/estilo.md).
	const carrusel = carruselPortadaEnabled(platform);
	const current = await currentSitePosts(platform);
	// A la par (cada consulta a la base es una vuelta): el lugar no cambia la venta de entradas.
	const [posts, ticketStates] = await Promise.all([
		// Un lugar vinculado manda sobre el «Dónde» del .md (el carrusel muestra el lugar).
		withVenuePlaces(getDB(platform), current),
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStatesFor(platform, current)
	]);
	return { posts, ticketStates, carrusel: await carrusel };
}

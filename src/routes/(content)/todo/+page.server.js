import { currentSitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { askVenuePlacesEarly, withVenuePlaces } from '$lib/server/amigues/venues.js';
import { askTicketStatesEarly, ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { tagDescriptionsData } from '$lib/server/wiki/site.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	// La venta y los lugares de las tarjetas, a la par de la lista (con lo que ya tiene el isolate).
	askTicketStatesEarly(platform);
	askVenuePlacesEarly(getDB(platform));
	const current = await currentSitePosts(platform);
	// A la par (cada consulta a la base es una vuelta): el lugar no cambia la venta de entradas.
	const [posts, ticketStates, descriptions] = await Promise.all([
		// Un lugar vinculado manda sobre el «Dónde» del .md.
		withVenuePlaces(getDB(platform), current),
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStatesFor(platform, current),
		// La descripción de las etiquetas elegidas y su «Es más complejo».
		tagDescriptionsData(platform)
	]);
	return { posts, ticketStates, ...descriptions };
}

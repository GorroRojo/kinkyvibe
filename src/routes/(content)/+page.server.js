import { currentSitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	const current = await currentSitePosts(platform);
	// A la par (cada consulta a la base es una vuelta): el lugar no cambia la venta de entradas.
	const [posts, ticketStates] = await Promise.all([
		// Un lugar vinculado manda sobre el «Dónde» del .md (el carrusel muestra el lugar).
		withVenuePlaces(getDB(platform), current),
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStatesFor(platform, current)
	]);
	return { posts, ticketStates };
}

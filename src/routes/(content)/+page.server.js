import { fetchCurrentPosts } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	// Un lugar vinculado manda sobre el «Dónde» del .md (el carrusel muestra el lugar).
	const posts = await withVenuePlaces(getDB(platform), await fetchCurrentPosts());
	return {
		posts,
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStates: await ticketStatesFor(platform, posts)
	};
}

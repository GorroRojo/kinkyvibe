import { currentSitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { tagDescriptionsData } from '$lib/server/wiki/site.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	// Un lugar vinculado manda sobre el «Dónde» del .md.
	const posts = await withVenuePlaces(getDB(platform), await currentSitePosts(platform));
	const [ticketStates, descriptions] = await Promise.all([
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStatesFor(platform, posts),
		// La descripción de las etiquetas elegidas y su «Es más complejo».
		tagDescriptionsData(platform)
	]);
	return { posts, ticketStates, ...descriptions };
}

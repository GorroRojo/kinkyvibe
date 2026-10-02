import { fetchCurrentPosts } from '$lib/utils';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	const posts = await fetchCurrentPosts();
	return {
		posts,
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStates: await ticketStatesFor(platform, posts)
	};
}

import { redirect } from '@sveltejs/kit';
import { stripMdPlace } from '$lib/utils/eventPlace.js';

/** @type {import("./$types").PageLoad} */
export async function load({ data }) {
	// El evento viene de la base (+page.server.js), con su texto ya armado: `html` (o `parts`,
	// con interactivos registrados) y su CSS propio.
	const post = data.post;
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	// `data` viene de +page.server.js (posts relacionados y el resumen de la venta de entradas
	// para el botón, `null` si el evento no vende entradas).
	// `venue`: el lugar según su privacidad (o `null`); si hay, manda sobre el «Dónde» del evento
	// (`location`, `location_name`, `location_map`), que entonces la página no recibe.
	const venue = data.venue ?? null;
	return {
		...data,
		...post,
		parts: post.parts ?? null,
		meta: venue ? stripMdPlace(post.meta) : post.meta,
		tickets: data.tickets ?? null,
		venue
	};
}

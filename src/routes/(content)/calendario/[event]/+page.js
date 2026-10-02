import { fetchPost } from '$lib/utils';
import { redirect } from '@sveltejs/kit';
import { stripMdPlace } from '$lib/utils/eventPlace.js';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	let post = await fetchPost('calendario', params.event);
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	// `data` viene de +page.server.js (posts relacionados y el resumen de la venta de entradas
	// para el botón, `null` si el evento no vende entradas).
	// `venue`: el lugar según su privacidad (o `null`); si hay, manda sobre el «Dónde» del .md
	// (`location`, `location_name`, `location_map`), que entonces la página no recibe.
	const venue = data?.venue ?? null;
	return {
		...data,
		...post,
		meta: venue ? stripMdPlace(post.meta) : post.meta,
		tickets: data?.tickets ?? null,
		venue,
		propinas: data?.propinas ?? false
	};
}

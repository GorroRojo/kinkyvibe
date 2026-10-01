import { fetchPost } from '$lib/utils';
import { redirect } from '@sveltejs/kit';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	let post = await fetchPost('calendario', params.event);
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	// `data` viene de +page.server.js (posts relacionados y el resumen de la venta de entradas
	// para el botón, `null` si el evento no vende entradas).
	// `venue`: el lugar según su privacidad (o `null`); si hay, manda sobre `location` del .md.
	return {
		...data,
		...post,
		tickets: data?.tickets ?? null,
		propinas: data?.propinas ?? false,
		venue: data?.venue ?? null
	};
}

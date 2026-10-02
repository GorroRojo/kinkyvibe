import { fetchPost } from '$lib/utils';
import { redirect } from '@sveltejs/kit';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	// Interruptor `contenido_db`: el evento viene entero del servidor (no hay componente .md;
	// la página muestra `post.html`).
	let post = data?.mode === 'db' ? data.post : await fetchPost('calendario', params.event);
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	// `data` viene de +page.server.js (posts relacionados y el resumen de la venta de entradas
	// para el botón, `null` si el evento no vende entradas).
	// `venue`: el lugar según su privacidad (o `null`); si hay, manda sobre `location` del .md.
	return {
		...data,
		...post,
		// el texto del evento de la base, ya armado y limpio (sin .md no hay componente)
		html: data?.mode === 'db' ? data.post.html : undefined,
		tickets: data?.tickets ?? null,
		venue: data?.venue ?? null,
		propinas: data?.propinas ?? false
	};
}

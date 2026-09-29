import { fetchPost } from '$lib/utils';
import { redirect } from '@sveltejs/kit';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	let post = await fetchPost('calendario', params.event);
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	// `data` viene de +page.server.js (posts relacionados, contador de "Me interesa" —`null` si no
	// hay base de datos— y el resumen de la venta de entradas para el botón, `null` si el evento
	// no vende entradas).
	return { ...data, ...post, interest: data?.interest ?? null, tickets: data?.tickets ?? null };
}

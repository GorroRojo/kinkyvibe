import { fetchPost } from '$lib/utils';
import { error } from '@sveltejs/kit';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	/** @type {Awaited<ReturnType<typeof fetchPost>>} */
	let post;
	if (data.event) return { meta: data.event.meta, path: data.event.path, tickets: data.tickets };
	try {
		// Solo el frontmatter (título, fecha, lugar, imagen) para el encabezado compacto.
		post = await fetchPost('calendario', params.event, true);
	} catch {
		error(404, 'Ese evento no existe.');
	}
	return { meta: post.meta, path: post.path, tickets: data.tickets };
}

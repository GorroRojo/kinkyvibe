import { fetchPost } from '$lib/utils';
import { error } from '@sveltejs/kit';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	/** @type {Awaited<ReturnType<typeof fetchPost>>} */
	let post;
	try {
		// Solo el frontmatter (título, fecha, lugar, imagen) para el encabezado compacto.
		post = await fetchPost('calendario', params.event, true);
	} catch {
		error(404, 'Ese evento no existe.');
	}
	return { meta: post.meta, path: post.path, tickets: data.tickets };
}

import { fetchPost } from '$lib/utils';
import { error } from '@sveltejs/kit';
import { stripMdPlace } from '$lib/utils/eventPlace.js';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	/** @type {Awaited<ReturnType<typeof fetchPost>>} */
	let post;
	// Un lugar vinculado manda sobre el «Dónde» del .md (como en la página del evento).
	const venue = data.venue ?? null;
	// Interruptor `contenido_db`: el evento de la base (ya sin el «Dónde» si tiene lugar).
	if (data.event) {
		return {
			meta: data.event.meta,
			path: data.event.path,
			tickets: data.tickets,
			venue,
			account: data.account
		};
	}
	try {
		// Solo el frontmatter (título, fecha, lugar, imagen) para el encabezado compacto.
		post = await fetchPost('calendario', params.event, true);
	} catch {
		error(404, 'Ese evento no existe.');
	}
	return {
		meta: venue ? stripMdPlace(post.meta) : post.meta,
		path: post.path,
		tickets: data.tickets,
		venue,
		account: data.account
	};
}

import { redirect } from '@sveltejs/kit';
import { venuePlaceMeta } from '$lib/utils/eventPlace.js';

/** @type {import("./$types").PageLoad} */
export async function load({ data }) {
	// El evento de la base (ver +page.server.js).
	const post = { meta: data.meta, path: data.path };
	// igual que la página del evento: los que redirigen a otro lado no se comparten desde acá
	if (post.meta?.redirect && post.meta.link) redirect(307, post.meta.link);
	// Un lugar vinculado manda sobre el «Dónde» del evento (`data.venue`, de +page.server.js): la
	// imagen y el texto muestran el lugar según su privacidad.
	return { meta: venuePlaceMeta(post.meta, data.venue), path: post.path };
}

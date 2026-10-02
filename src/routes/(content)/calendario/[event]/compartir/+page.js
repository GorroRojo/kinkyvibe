import { fetchPost } from '$lib/utils';
import { error, redirect } from '@sveltejs/kit';
import { venuePlaceMeta } from '$lib/utils/eventPlace.js';

/** @type {import("./$types").PageLoad} */
export async function load({ params, data }) {
	/** @type {{ meta: AnyPostData, path: string }} */
	let post;
	if (data?.mode === 'db') {
		// interruptor `contenido_db`: el evento de la base (ver +page.server.js)
		post = { meta: data.meta, path: data.path };
	} else {
		try {
			// shallow: solo hacen falta los metadatos públicos del evento (los mismos que muestra
			// su página); fetchPost ya da 404 para los eventos no publicados
			post = await fetchPost('calendario', params.event, true);
		} catch (e) {
			throw error(404, 'Evento no encontrado');
		}
	}
	// igual que la página del evento: los que redirigen a otro lado no se comparten desde acá
	if (post.meta?.redirect && post.meta.link) redirect(307, post.meta.link);
	// Un lugar vinculado manda sobre el «Dónde» del .md (`data.venue`, de +page.server.js): la
	// imagen y el texto muestran el lugar según su privacidad.
	return { meta: venuePlaceMeta(post.meta, data?.venue), path: post.path };
}

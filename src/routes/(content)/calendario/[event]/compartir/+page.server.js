import { error } from '@sveltejs/kit';
import { siteEvent } from '$lib/server/contenido/posts.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';

/**
 * Interruptor `contenido_db`: los datos del evento salen de la base (si la tiene). Si no, `md` y
 * +page.js los lee del .md como siempre.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ params, platform, locals }) {
	const found = await siteEvent(platform, params.event, {
		viewer: viewerFor(locals),
		shallow: true,
		html: false
	});
	if (found.mode === 'md') return { mode: /** @type {const} */ ('md') };
	if (!found.post) error(404, 'Evento no encontrado');
	return { mode: /** @type {const} */ ('db'), meta: found.post.meta, path: found.post.path };
}

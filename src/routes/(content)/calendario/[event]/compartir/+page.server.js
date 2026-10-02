import { error } from '@sveltejs/kit';
import { siteEvent } from '$lib/server/contenido/posts.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { getDB } from '$lib/server/db';
import { eventPageVenue } from '$lib/server/amigues/venues.js';
import { stripMdPlace } from '$lib/utils/eventPlace.js';

/**
 * Interruptor `contenido_db`: los datos del evento salen de la base (si la tiene). Si no, `md` y
 * +page.js los lee del .md como siempre.
 *
 * "Sucede en" para las imágenes y el texto para compartir: como en la página del evento, si tiene
 * lugar, manda sobre el «Dónde» del evento (ver +page.js). `null` si no tiene lugar.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ params, platform, locals }) {
	const [found, venue] = await Promise.all([
		siteEvent(platform, params.event, { viewer: viewerFor(locals), shallow: true, html: false }),
		eventPageVenue(getDB(platform), params.event, locals)
	]);
	if (found.mode === 'md') return { mode: /** @type {const} */ ('md'), venue };
	if (!found.post) error(404, 'Evento no encontrado');
	const meta = venue ? stripMdPlace(found.post.meta) : found.post.meta;
	return { mode: /** @type {const} */ ('db'), meta, path: found.post.path, venue };
}

import { error } from '@sveltejs/kit';
import { siteEvent } from '$lib/server/contenido/posts.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { getDB } from '$lib/server/db';
import { eventPageVenue } from '$lib/server/amigues/venues.js';
import { stripMdPlace } from '$lib/utils/eventPlace.js';

/**
 * Los datos del evento salen de la base; si la base no lo tiene (o quien mira no lo puede ver),
 * 404.
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
	if (!found) error(404, 'Evento no encontrado');
	const meta = venue ? stripMdPlace(found.meta) : found.meta;
	return { meta, path: found.path, venue };
}

import { getDB } from '$lib/server/db';
import { eventPageVenue } from '$lib/server/amigues/venues.js';

/**
 * "Sucede en" para las imágenes y el texto para compartir: como en la página del evento, si tiene
 * lugar, manda sobre el «Dónde» del .md (ver +page.js). `null` si no tiene lugar.
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ params, platform, locals }) {
	return { venue: await eventPageVenue(getDB(platform), params.event, locals) };
}

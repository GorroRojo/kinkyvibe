/**
 * «Buscar persona» de la puerta con link. Con un link vivo de este evento (`requireDoorLink`); ver
 * `doorSearch` en $lib/server/tickets/doorScreen.js.
 */
import { getDB } from '$lib/server/db';
import { doorSearch } from '$lib/server/tickets/doorScreen.js';
import { requireDoorLink } from '$lib/server/tickets/doorLinks.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	return doorSearch(event, await requireDoorLink(event, getDB(event.platform)));
}

/**
 * Lista sin conexión de la puerta con link (hash del token, últimos 3 del DNI). Con un link vivo de
 * este evento (`requireDoorLink`); ver `doorList` en $lib/server/tickets/doorScreen.js.
 */
import { getDB } from '$lib/server/db';
import { doorList } from '$lib/server/tickets/doorScreen.js';
import { requireDoorLink } from '$lib/server/tickets/doorLinks.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	return doorList(event, await requireDoorLink(event, getDB(event.platform)));
}

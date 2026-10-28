/**
 * «Ver compra» de la puerta con link (queda en el registro). Con un link vivo de este evento
 * (`requireDoorLink`); ver `doorPurchase` en $lib/server/tickets/doorScreen.js.
 */
import { getDB } from '$lib/server/db';
import { doorPurchase } from '$lib/server/tickets/doorScreen.js';
import { requireDoorLink } from '$lib/server/tickets/doorLinks.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	return doorPurchase(event, await requireDoorLink(event, getDB(event.platform)));
}

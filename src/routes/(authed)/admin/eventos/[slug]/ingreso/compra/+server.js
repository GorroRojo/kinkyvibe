/**
 * Detalle completo de la compra de una entrada (hoja "Ver compra" del modo puerta). Solo admins.
 * Ver `doorPurchase` en $lib/server/tickets/doorScreen.js.
 */
import { adminActor, doorPurchase } from '$lib/server/tickets/doorScreen.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	return doorPurchase(event, adminActor(event));
}

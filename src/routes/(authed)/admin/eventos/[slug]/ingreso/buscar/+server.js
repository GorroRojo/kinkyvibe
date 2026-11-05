/**
 * Sugerencias del buscador del modo puerta ("Buscar persona"). Solo admins (los `+server.js` no
 * pasan por el layout: se chequea acá). Ver `doorSearch` en $lib/server/tickets/doorScreen.js.
 */
import { adminActor, doorSearch } from '$lib/server/tickets/doorScreen.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	return doorSearch(event, adminActor(event));
}

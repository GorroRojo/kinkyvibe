/**
 * Lista de entradas del evento para validar sin conexión en el modo puerta. Solo admins. Ver
 * `doorList` en $lib/server/tickets/doorScreen.js.
 */
import { adminActor, doorList } from '$lib/server/tickets/doorScreen.js';

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	return doorList(event, adminActor(event));
}

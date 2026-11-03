/**
 * Modo puerta (check-in) de un evento: pantalla completa sin menús (`bare: true`). Solo admins:
 * el `load` y cada acción llaman a `requireAdmin` (`adminActor`). La lógica es la misma que la de
 * la puerta con link (/puerta/<slug>): $lib/server/tickets/doorScreen.js.
 */
import { adminActor, doorActions, doorLoad } from '$lib/server/tickets/doorScreen.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	return doorLoad(event, adminActor(event));
}

/** @type {import('./$types').Actions} */
export const actions = doorActions(adminActor);

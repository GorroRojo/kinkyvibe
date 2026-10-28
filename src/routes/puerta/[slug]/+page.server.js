/**
 * Modo puerta con link (/puerta/<slug>): la misma pantalla y la misma lógica que el panel
 * ($lib/server/tickets/doorScreen.js), con un link de puerta en vez de une admin. El `load` y
 * **cada** acción vuelven a mirar el link en la base (`requireDoorLink`): de este evento, sin vencer
 * ni revocar, y dentro del tope de pedidos. Si no, 403.
 */
import { getDB } from '$lib/server/db';
import { doorActions, doorLoad } from '$lib/server/tickets/doorScreen.js';
import { requireDoorLink } from '$lib/server/tickets/doorLinks.js';

/** @param {any} event */
const linkActor = (event) => requireDoorLink(event, getDB(event.platform));

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const actor = await linkActor(event);
	event.setHeaders({ 'x-robots-tag': 'noindex' });
	return doorLoad(event, actor);
}

/** @type {import('./$types').Actions} */
export const actions = doorActions(linkActor);

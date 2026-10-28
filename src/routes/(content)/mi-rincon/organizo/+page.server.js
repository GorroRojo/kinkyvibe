/**
 * Mi rincón → Eventos que organizás (prototipo, interruptor `rol_organizadore`). Quién entra y qué
 * se ve: src/lib/server/personas/organizadore.js (apagado o sin el permiso de perfiles, 404).
 */
import { logDBError } from '$lib/server/db';
import { myOrganizedEvents, requireOrganizerArea } from '$lib/server/personas/organizadore.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const { db, member } = await requireOrganizerArea(event);
	try {
		return { events: await myOrganizedEvents(db, member.id), error: false };
	} catch (e) {
		logDBError('eventos que organiza la cuenta', e);
		return { events: [], error: true };
	}
}

import { error } from '@sveltejs/kit';
import { getEventAdmin, listEvents } from '$lib/server/eventos';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	if (!getEventAdmin(locals)) throw error(403, 'No tenés permiso para cargar eventos.');
	return { events: await listEvents() };
}

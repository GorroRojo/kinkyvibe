import { requireAdmin } from '$lib/server/auth';
import { listEvents } from '$lib/server/eventos';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
	requireAdmin(locals, url);
	return { events: await listEvents() };
}

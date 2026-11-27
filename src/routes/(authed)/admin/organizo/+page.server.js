/**
 * «Tus eventos»: el inicio del panel para une organizadore (interruptor `rol_organizadore`,
 * src/lib/server/admin/organizadore.js). Los eventos publicados que organiza, con links a su
 * ficha, Ventas, la Puerta y Editar. Para cualquier otra persona (admins incluides), 404.
 */
import { error } from '@sveltejs/kit';
import { isOrganizerRequest } from '$lib/server/admin/organizadore.js';

/** @type {import('./$types').PageServerLoad} */
export function load({ locals, setHeaders }) {
	const org = isOrganizerRequest(locals) ? locals.organizer : null;
	if (!org) error(404, 'Not found');
	setHeaders({ 'cache-control': 'private, no-store' });
	return {
		events: org.events.map((e) => ({
			slug: e.slug,
			title: e.title,
			start: e.start,
			profiles: e.profiles
		}))
	};
}

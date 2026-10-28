/**
 * Mi rincón → Eventos que organizás → un evento (prototipo, interruptor `rol_organizadore`): cómo
 * va la venta, la lista para la puerta y el texto del evento. Quién entra y qué se ve:
 * src/lib/server/personas/organizadore.js. La página y la acción pasan por
 * `requireEventOrganizer` (las acciones no corren el load: cada una se fija sola).
 */
import { fail } from '@sveltejs/kit';
import { logDBError } from '$lib/server/db';
import {
	ORGANIZER_BODY_MAX,
	organizerDoorList,
	organizerEventText,
	organizerSales,
	requireEventOrganizer,
	saveOrganizerEventText
} from '$lib/server/personas/organizadore.js';

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	event.setHeaders({ 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
	const access = await requireEventOrganizer(event);
	const slug = access.event.slug;
	const [sales, door, text] = await Promise.all([
		organizerSales(access.db, slug).catch((e) => {
			logDBError('venta para organizadores', e);
			return null;
		}),
		organizerDoorList(access.db, slug).catch((e) => {
			logDBError('lista de puerta para organizadores', e);
			return null;
		}),
		organizerEventText(slug)
	]);
	return {
		event: access.event,
		profiles: access.profiles.map((p) => p.title),
		sales,
		door,
		text,
		bodyMax: ORGANIZER_BODY_MAX
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	texto: async (event) => {
		const access = await requireEventOrganizer(event);
		const form = await event.request.formData();
		const body = form.get('body');
		const sha = form.get('sha');
		if (typeof body !== 'string' || typeof sha !== 'string' || !sha) {
			return fail(400, {
				message: 'Faltan datos. Recargá la página y volvé a intentar.',
				body: typeof body === 'string' ? body : ''
			});
		}
		const r = await saveOrganizerEventText(access.db, {
			accountId: access.member.id,
			slug: access.event.slug,
			title: access.event.title,
			body: body.slice(0, ORGANIZER_BODY_MAX + 1),
			sha,
			profile: access.profiles[0]
		});
		if (!r.ok) return fail(r.status, { message: r.message, body });
		return { saved: true };
	}
};

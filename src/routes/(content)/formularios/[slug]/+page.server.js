/**
 * Un formulario en `kinkyvibe.ar/formularios/<dirección>` (docs/formularios.md). Con el interruptor
 * `formularios` apagado, o si no existe (las plantillas y las encuestas no tienen esta página), 404.
 * Las reglas de quién responde y qué se guarda: src/lib/server/formularios/public.js.
 */
import { error } from '@sveltejs/kit';
import { getFormBySlug } from '$lib/server/formularios/store.js';
import {
	FORM_HEADERS,
	checkAction,
	publicFormData,
	requireFormsPublic,
	submitPublicForm
} from '$lib/server/formularios/public.js';
import { getEventMeta } from '$lib/server/tickets/events.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, locals, setHeaders, url }) {
	setHeaders({ ...FORM_HEADERS });
	const db = await requireFormsPublic(platform);
	const form = await getFormBySlug(db, params.slug);
	if (!form) error(404, 'No encontramos este formulario.');
	const meta = form.eventSlug ? await getEventMeta(form.eventSlug) : null;
	return {
		form: {
			...publicFormData(form, {
				member: locals.member,
				eventTitle: typeof meta?.title === 'string' ? meta.title : null
			}),
			loginHref: `/ingresar?next=${encodeURIComponent(url.pathname)}`
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	send: async (event) => {
		const db = await requireFormsPublic(event.platform);
		return submitPublicForm(event, await getFormBySlug(db, event.params.slug));
	},
	check: async (event) => {
		const db = await requireFormsPublic(event.platform);
		return checkAction(event, await getFormBySlug(db, event.params.slug));
	}
};

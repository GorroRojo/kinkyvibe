/**
 * La encuesta de después de un evento en `/calendario/<evento>/encuesta` (docs/formularios.md):
 * es para quienes tenían entrada, con el link personal del mail (la clave va en el fragmento, ver
 * PublicForm.svelte). Con el interruptor `formularios` apagado, o si el evento no tiene encuesta,
 * 404. Las reglas: src/lib/server/formularios/public.js.
 */
import { error } from '@sveltejs/kit';
import { getEventSurvey } from '$lib/server/formularios/store.js';
import {
	FORM_HEADERS,
	checkAction,
	publicFormData,
	requireFormsPublic,
	submitPublicForm
} from '$lib/server/formularios/public.js';
import { getEventTickets } from '$lib/server/tickets/events.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, locals, setHeaders, url }) {
	setHeaders({ ...FORM_HEADERS });
	const db = await requireFormsPublic(platform);
	const [config, survey] = await Promise.all([
		getEventTickets(params.event),
		getEventSurvey(db, params.event)
	]);
	if (!config || !survey) error(404, 'No encontramos esta encuesta.');
	return {
		form: {
			...publicFormData(survey, {
				member: locals.member,
				eventTitle: config.title || params.event
			}),
			loginHref: `/ingresar?next=${encodeURIComponent(url.pathname)}`
		}
	};
}

/** @type {import('./$types').Actions} */
export const actions = {
	default: async (event) => {
		const db = await requireFormsPublic(event.platform);
		return submitPublicForm(event, await getEventSurvey(db, event.params.event));
	},
	check: async (event) => {
		const db = await requireFormsPublic(event.platform);
		return checkAction(event, await getEventSurvey(db, event.params.event));
	}
};

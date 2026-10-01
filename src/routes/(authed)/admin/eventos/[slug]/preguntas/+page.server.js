/**
 * Ficha del evento, pestaña Preguntas (interruptor `personas_eventos`; apagado, 404): lo que se
 * pregunta al comprar o inscribirse, además de los datos de siempre. Preguntas propias de este
 * evento y las generales que elige usar (se definen en Eventos › Roles y preguntas). Las
 * respuestas se ven en Órdenes y en su CSV.
 */
import { error, fail } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { logDBError } from '$lib/server/db';
import {
	createFieldAction,
	deleteFieldAction,
	requirePersonasAdmin
} from '$lib/server/personas/admin.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	chosenGeneralIds,
	listGeneralFields,
	listOwnFields,
	setChosenGeneral
} from '$lib/server/tickets/signupFields.js';

/**
 * Solo eventos que venden entradas (o se inscriben) por el sitio: las preguntas van en esa
 * compra.
 * @param {string} slug
 */
async function requireTicketed(slug) {
	if (!(await getEventTickets(slug))) error(404, 'Ese evento no vende entradas.');
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
	const { db } = await requirePersonasAdmin(event);
	await requireTicketed(event.params.slug);
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const [own, general, chosen] = await Promise.all([
		listOwnFields(db, event.params.slug),
		listGeneralFields(db),
		chosenGeneralIds(db, event.params.slug)
	]);
	return { own, general, chosen };
}

/** @type {import('./$types').Actions} */
export const actions = {
	createField: async (event) => {
		await requireTicketed(event.params.slug);
		return createFieldAction(event, event.params.slug);
	},
	deleteField: (event) => deleteFieldAction(event, event.params.slug),
	setGeneral: async (event) => {
		const { db } = await requirePersonasAdmin(event);
		await requireTicketed(event.params.slug);
		const ids = (await event.request.formData()).getAll('general').map(Number);
		let count;
		try {
			count = await setChosenGeneral(db, event.params.slug, ids);
		} catch (e) {
			logDBError('elegir preguntas generales', e);
			return fail(500, { general: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
		}
		await logAdminAction(db, event.locals, {
			action: 'signup_field.choose',
			targetType: 'event',
			targetId: event.params.slug,
			summary: `Eligió ${count === 1 ? '1 pregunta general' : `${count} preguntas generales`}`,
			detail: { ids }
		});
		return { general: { ok: true, message: 'Guardado.' } };
	}
};

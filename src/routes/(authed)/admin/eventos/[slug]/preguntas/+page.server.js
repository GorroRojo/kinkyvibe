/**
 * Ficha del evento, pestaña Preguntas: lo que se
 * pregunta al comprar o inscribirse, además de los datos de siempre. Preguntas propias de este
 * evento y las generales que elige usar (se definen en Eventos › Roles y preguntas). Cada
 * pregunta propia se puede editar y acotar a algunos tipos de entrada; una general, acotar en
 * este evento. Las respuestas se ven en Órdenes y en su CSV.
 */
import { error, fail } from '@sveltejs/kit';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { logDBError } from '$lib/server/db';
import {
	createFieldAction,
	deleteFieldAction,
	eventTicketTypes,
	requirePersonasAdmin,
	updateFieldAction
} from '$lib/server/personas/admin.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	chosenGeneral,
	listGeneralFields,
	listOwnFields,
	setChosenGeneral
} from '$lib/server/tickets/signupFields.js';
import { validateFieldScope } from '$lib/utils/signupFields.js';

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
	const [own, general, chosen, types] = await Promise.all([
		listOwnFields(db, event.params.slug),
		listGeneralFields(db),
		chosenGeneral(db, event.params.slug),
		eventTicketTypes(event.params.slug)
	]);
	return { own, general, chosen, types };
}

/** @type {import('./$types').Actions} */
export const actions = {
	createField: async (event) => {
		await requireTicketed(event.params.slug);
		return createFieldAction(event, event.params.slug);
	},
	updateField: async (event) => {
		await requireTicketed(event.params.slug);
		return updateFieldAction(event, event.params.slug);
	},
	deleteField: (event) => deleteFieldAction(event, event.params.slug),
	setGeneral: async (event) => {
		const { db } = await requirePersonasAdmin(event);
		await requireTicketed(event.params.slug);
		const form = await event.request.formData();
		const ids = form.getAll('general').map(Number);
		// A qué tipos de entrada aplica cada general en este evento (`scope_<id>` = `some`).
		const typeIds = (await eventTicketTypes(event.params.slug)).map((t) => t.id);
		/** @type {Record<number, string[]>} */
		const typesById = {};
		for (const id of ids) {
			const scope = validateFieldScope(
				{ scope: form.get(`scope_${id}`), ticketTypes: form.getAll(`ticket_types_${id}`) },
				typeIds
			);
			if (!scope.ok) {
				return fail(400, {
					general: { ok: false, message: `Pregunta ${id}: ${scope.errors.ticketTypes}` }
				});
			}
			typesById[id] = scope.ticketTypes;
		}
		let count;
		try {
			count = await setChosenGeneral(db, event.params.slug, ids, typesById);
		} catch (e) {
			logDBError('elegir preguntas generales', e);
			return fail(500, { general: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
		}
		await logAdminAction(db, event.locals, {
			action: 'signup_field.choose',
			targetType: 'event',
			targetId: event.params.slug,
			summary: `Eligió ${count === 1 ? '1 pregunta general' : `${count} preguntas generales`}`,
			detail: { ids, ticketTypes: typesById }
		});
		return { general: { ok: true, message: 'Guardado.' } };
	}
};

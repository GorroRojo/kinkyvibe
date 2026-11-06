/**
 * Las respuestas de los formularios de un evento para quienes lo organizan (docs/formularios.md):
 * la misma regla que las respuestas de inscripción (decisión 0024, src/lib/server/personas/
 * organiza.js `requireOrganizer`): gestionar un perfil que figura con el rol «Organiza» en ese
 * evento. Además: el interruptor `formularios` prendido, y el formulario es de ese evento y no es
 * «Solo admins». Si algo no se cumple, 404 (no 403).
 *
 * Ven todas las respuestas (sin mínimo), con nombre solo si la privacidad de hoy lo deja ver y
 * nunca el mail (como en las de inscripción). Cada vista y cada CSV quedan en Actividad.
 */
import { error } from '@sveltejs/kit';
import { formulariosEnabled } from '$lib/server/flags.js';
import { requireOrganizer } from '$lib/server/personas/organiza.js';
import { organizersSee } from '$lib/utils/formularios.js';
import { getForm, organizerForms } from './store.js';

/**
 * La entrada de la página y del CSV: lo de `requireOrganizer` más el formulario de `params.id`.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 */
export async function requireOrganizerForm(event) {
	const access = await requireOrganizer(event);
	if (!(await formulariosEnabled(event.platform))) error(404, 'Not found');
	const id = Number(event.params.id);
	const form = Number.isSafeInteger(id) && id > 0 ? await getForm(access.db, id) : null;
	if (
		!form ||
		form.kind === 'template' ||
		form.eventSlug !== access.event.slug ||
		!organizersSee(form)
	)
		error(404, 'Not found');
	return { ...access, form };
}

/**
 * Los formularios de un evento que puede ver quien lo organiza (para su página de respuestas).
 * Con el interruptor apagado, ninguno.
 *
 * @param {App.Platform | undefined} platform
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} eventSlug
 */
export async function formsForOrganizer(platform, db, eventSlug) {
	if (!(await formulariosEnabled(platform))) return [];
	return (await organizerForms(db, eventSlug)).map((f) => ({
		id: f.id,
		kind: f.kind,
		title: f.title,
		responses: f.responses
	}));
}

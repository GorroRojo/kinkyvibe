/**
 * Panel: roles de personas y preguntas de inscripción (Ajustes → Personas y preguntas, y la
 * pestaña Preguntas de cada evento). Lo común a esas páginas: la entrada (solo admins y con el
 * interruptor prendido) y las acciones de preguntas, que son las mismas para las generales
 * (`eventSlug` null) y las de un evento.
 *
 * Los form actions no pasan por el layout: cada uno llama a {@link requirePersonasAdmin}.
 */
import { error, fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB, logDBError } from '$lib/server/db';
import { personasEventosEnabled } from '$lib/server/flags.js';
import { createField, deleteField } from '$lib/server/tickets/signupFields.js';
import { validateFieldDef } from '$lib/utils/signupFields.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Solo admins (303 a /login sin sesión, 403 sin permiso), con base y con el interruptor
 * `personas_eventos` prendido (apagado: 404, como si la página no existiera).
 *
 * @param {{ locals: App.Locals, url: URL, platform?: App.Platform }} event
 * @returns {Promise<{ admin: NonNullable<App.Locals['user']>, db: D1Database }>}
 */
export async function requirePersonasAdmin({ locals, url, platform }) {
	const admin = requireAdmin(locals, url);
	if (!(await personasEventosEnabled(platform))) error(404, 'Not found');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	return { admin, db };
}

/**
 * Acción "crear pregunta" (general con `eventSlug` null).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string | null} eventSlug
 */
export async function createFieldAction(event, eventSlug) {
	const { admin, db } = await requirePersonasAdmin(event);
	const form = await event.request.formData();
	const raw = {
		label: String(form.get('label') ?? '').slice(0, 500),
		kind: String(form.get('kind') ?? ''),
		required: form.get('required'),
		options: String(form.get('options') ?? '').slice(0, 2000)
	};
	const valid = validateFieldDef(raw);
	if (!valid.ok) {
		return fail(400, {
			field: { ok: false, message: 'Revisá la pregunta.', errors: valid.errors, values: raw }
		});
	}
	let created;
	try {
		created = await createField(db, eventSlug, valid.field, { by: admin.login });
	} catch (e) {
		logDBError('crear pregunta de inscripción', e);
		return fail(500, { field: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
	}
	if (!created.ok)
		return fail(400, { field: { ok: false, message: created.message, values: raw } });
	await logAdminAction(db, event.locals, {
		action: 'signup_field.create',
		targetType: eventSlug ? 'event' : 'settings',
		targetId: eventSlug ?? 'signup_fields',
		summary: `Agregó la pregunta «${valid.field.label}»${eventSlug ? '' : ' (general)'}`,
		detail: { id: created.id, kind: valid.field.kind, required: valid.field.required }
	});
	return { field: { ok: true, message: 'Pregunta agregada.' } };
}

/**
 * Acción "borrar pregunta" (de ese evento, o general con `eventSlug` null).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string | null} eventSlug
 */
export async function deleteFieldAction(event, eventSlug) {
	const { db } = await requirePersonasAdmin(event);
	const form = await event.request.formData();
	const id = Number(form.get('id'));
	/** @type {string | null} */
	let deleted = null;
	try {
		deleted = await deleteField(db, id, eventSlug);
	} catch (e) {
		logDBError('borrar pregunta de inscripción', e);
		return fail(500, { field: { ok: false, message: 'No se pudo borrar. Probá de nuevo.' } });
	}
	if (!deleted) return fail(404, { field: { ok: false, message: 'Esa pregunta ya no existe.' } });
	await logAdminAction(db, event.locals, {
		action: 'signup_field.delete',
		targetType: eventSlug ? 'event' : 'settings',
		targetId: eventSlug ?? 'signup_fields',
		summary: `Borró la pregunta «${deleted}»${eventSlug ? '' : ' (general)'}`,
		detail: { id }
	});
	return {
		field: {
			ok: true,
			message: 'Pregunta borrada. Las respuestas que ya había quedan en las órdenes.'
		}
	};
}

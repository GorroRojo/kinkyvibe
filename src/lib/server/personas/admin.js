/**
 * Panel: roles de personas y preguntas de inscripción (Eventos › Roles y preguntas, y la
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
import { getEventTickets } from '$lib/server/tickets/events.js';
import { createField, deleteField, updateField } from '$lib/server/tickets/signupFields.js';
import { validateFieldDef, validateFieldScope } from '$lib/utils/signupFields.js';

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
 * Los tipos de entrada de un evento (para acotar una pregunta), o `[]` para las generales.
 * @param {string | null} eventSlug
 * @returns {Promise<{ id: string, name: string }[]>}
 */
export async function eventTicketTypes(eventSlug) {
	if (!eventSlug) return [];
	const config = await getEventTickets(eventSlug);
	return (config?.types ?? []).map((t) => ({ id: t.id, name: t.name }));
}

/**
 * Lee y valida el formulario de una pregunta (crear o editar): texto, tipo, opciones,
 * obligatoria y alcance (tipos de entrada del evento y una vez por compra o por entrada).
 *
 * @param {FormData} form
 * @param {string | null} eventSlug
 */
async function readFieldForm(form, eventSlug) {
	const raw = {
		label: String(form.get('label') ?? '').slice(0, 500),
		kind: String(form.get('kind') ?? ''),
		required: form.get('required'),
		options: String(form.get('options') ?? '').slice(0, 2000),
		perTicket: form.get('per_ticket'),
		scope: String(form.get('scope') ?? 'all'),
		ticketTypes: form
			.getAll('ticket_types')
			.map((v) => String(v).slice(0, 100))
			.slice(0, 50)
	};
	const types = await eventTicketTypes(eventSlug);
	const def = validateFieldDef(raw);
	const scope = validateFieldScope(
		raw,
		types.map((t) => t.id)
	);
	const values = { ...raw, required: raw.required === 'on', perTicket: raw.perTicket === 'on' };
	if (!def.ok || !scope.ok) {
		return /** @type {const} */ ({
			ok: false,
			errors: { ...(def.ok ? {} : def.errors), ...(scope.ok ? {} : scope.errors) },
			values
		});
	}
	return /** @type {const} */ ({
		ok: true,
		field: { ...def.field, perTicket: scope.perTicket, ticketTypes: scope.ticketTypes },
		values
	});
}

/**
 * Acción "crear pregunta" (general con `eventSlug` null).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string | null} eventSlug
 */
export async function createFieldAction(event, eventSlug) {
	const { admin, db } = await requirePersonasAdmin(event);
	const read = await readFieldForm(await event.request.formData(), eventSlug);
	if (!read.ok) {
		return fail(400, {
			field: { ok: false, message: 'Revisá la pregunta.', errors: read.errors, values: read.values }
		});
	}
	const field = read.field;
	let created;
	try {
		created = await createField(db, eventSlug, field, { by: admin.login });
	} catch (e) {
		logDBError('crear pregunta de inscripción', e);
		return fail(500, { field: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
	}
	if (!created.ok)
		return fail(400, { field: { ok: false, message: created.message, values: read.values } });
	await logAdminAction(db, event.locals, {
		action: 'signup_field.create',
		targetType: eventSlug ? 'event' : 'settings',
		targetId: eventSlug ?? 'signup_fields',
		summary: `Agregó la pregunta «${field.label}»${eventSlug ? '' : ' (general)'}`,
		detail: {
			id: created.id,
			kind: field.kind,
			required: field.required,
			perTicket: field.perTicket,
			ticketTypes: field.ticketTypes
		}
	});
	return { field: { ok: true, message: 'Pregunta agregada.' } };
}

/**
 * Acción "editar pregunta" (de ese evento, o general con `eventSlug` null). Las respuestas ya
 * guardadas no cambian: tienen la pregunta copiada como estaba al comprar.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string | null} eventSlug
 */
export async function updateFieldAction(event, eventSlug) {
	const { admin, db } = await requirePersonasAdmin(event);
	const form = await event.request.formData();
	const id = Number(form.get('id'));
	const read = await readFieldForm(form, eventSlug);
	if (!read.ok) {
		return fail(400, {
			field: {
				ok: false,
				editing: id,
				message: 'Revisá la pregunta.',
				errors: read.errors,
				values: read.values
			}
		});
	}
	const field = read.field;
	/** @type {string | null} */
	let before = null;
	try {
		before = await updateField(db, id, eventSlug, field, { by: admin.login });
	} catch (e) {
		logDBError('editar pregunta de inscripción', e);
		return fail(500, { field: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
	}
	if (before === null) {
		return fail(404, { field: { ok: false, message: 'Esa pregunta ya no existe.' } });
	}
	await logAdminAction(db, event.locals, {
		action: 'signup_field.update',
		targetType: eventSlug ? 'event' : 'settings',
		targetId: eventSlug ?? 'signup_fields',
		summary: `Editó la pregunta «${field.label}»${before !== field.label ? ` (antes «${before}»)` : ''}${eventSlug ? '' : ' (general)'}`,
		detail: {
			id,
			kind: field.kind,
			required: field.required,
			perTicket: field.perTicket,
			ticketTypes: field.ticketTypes
		}
	});
	return {
		field: {
			ok: true,
			message: 'Pregunta guardada. Las respuestas que ya había quedan como se respondieron.'
		}
	};
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

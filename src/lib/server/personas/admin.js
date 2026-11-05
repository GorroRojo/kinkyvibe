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
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	createField,
	deleteField,
	listGeneralFields,
	listOwnFields,
	setFieldPositions,
	updateField
} from '$lib/server/tickets/signupFields.js';
import {
	MAX_EVENT_FIELDS,
	MAX_GENERAL_FIELDS,
	validateFieldDef,
	validateFieldScope
} from '$lib/utils/signupFields.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Solo admins (303 a /login sin sesión, 403 sin permiso) y con base.
 *
 * @param {{ locals: App.Locals, url: URL, platform?: App.Platform }} event
 * @returns {Promise<{ admin: NonNullable<App.Locals['user']>, db: D1Database }>}
 */
export async function requirePersonasAdmin({ locals, url, platform }) {
	const admin = requireAdmin(locals, url);
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
 * Acción "borrar pregunta" (de ese evento, o general con `eventSlug` null). Es un borrado suave
 * (decisión 0033): se recupera desde Actividad, con lo que eligió cada evento.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string | null} eventSlug
 */
export async function deleteFieldAction(event, eventSlug) {
	const { admin, db } = await requirePersonasAdmin(event);
	const form = await event.request.formData();
	const id = Number(form.get('id'));
	/** @type {string | null} */
	let deleted = null;
	try {
		deleted = await deleteField(db, id, eventSlug, { by: admin.login });
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
			message:
				'Pregunta borrada. Las respuestas que ya había quedan en las órdenes. Si te equivocaste, la recuperás desde Actividad.'
		}
	};
}

/**
 * Acción «Guardar preguntas» del editor compartido (QuestionEditor, interruptor `formularios`;
 * docs/formularios.md): la lista entera en su orden (JSON en `questions`). Las que traen el id de
 * una pregunta de acá se editan si cambiaron, las nuevas se crean y las que ya no están se borran
 * (borrado suave, decisión 0033: se recuperan desde Actividad). Después guarda el orden. Las
 * respuestas ya guardadas no cambian. Las tablas son las de siempre (`signup_fields`).
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {string | null} eventSlug
 */
export async function saveFieldsAction(event, eventSlug) {
	const { admin, db } = await requirePersonasAdmin(event);
	const form = await event.request.formData();
	const max = eventSlug === null ? MAX_GENERAL_FIELDS : MAX_EVENT_FIELDS;
	/** @type {unknown} */
	let list;
	try {
		list = JSON.parse(String(form.get('questions') ?? '[]').slice(0, 200_000));
	} catch {
		list = null;
	}
	if (!Array.isArray(list)) {
		return fail(400, { fields: { ok: false, message: 'No se pudieron leer las preguntas.' } });
	}
	if (list.length > max) {
		return fail(400, {
			fields: {
				ok: false,
				message:
					eventSlug === null
						? `Hasta ${MAX_GENERAL_FIELDS} preguntas generales.`
						: `Hasta ${MAX_EVENT_FIELDS} preguntas propias por evento.`
			}
		});
	}
	const typeIds = (await eventTicketTypes(eventSlug)).map((t) => t.id);
	/** @type {Record<number, Record<string, string>>} */
	const errors = {};
	/** @type {{ id: number | null, field: Omit<import('$lib/utils/signupFields.js').SignupField, 'id'> }[]} */
	const wanted = [];
	list.forEach((raw, i) => {
		const item = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
		const def = validateFieldDef({
			label: typeof item.label === 'string' ? item.label.slice(0, 500) : '',
			kind: item.kind,
			required: item.required === true,
			options: Array.isArray(item.options) ? item.options.slice(0, 50).map(String) : []
		});
		const scope = validateFieldScope(
			{
				perTicket: item.perTicket === true,
				scope: item.scope === 'some' ? 'some' : 'all',
				ticketTypes: Array.isArray(item.ticketTypes) ? item.ticketTypes.slice(0, 50) : []
			},
			typeIds
		);
		if (!def.ok || !scope.ok) {
			errors[i] = { ...(def.ok ? {} : def.errors), ...(scope.ok ? {} : scope.errors) };
			return;
		}
		const id = Number(item.id);
		wanted.push({
			id: Number.isSafeInteger(id) && id > 0 ? id : null,
			field: { ...def.field, perTicket: scope.perTicket, ticketTypes: scope.ticketTypes }
		});
	});
	if (Object.keys(errors).length) {
		const n = Object.keys(errors).length;
		return fail(400, {
			fields: {
				ok: false,
				message: n === 1 ? 'Revisá 1 pregunta.' : `Revisá ${n} preguntas.`,
				errors
			}
		});
	}
	/** @type {{ created: string[], updated: string[], deleted: string[] }} */
	const done = { created: [], updated: [], deleted: [] };
	/** @type {number[]} */
	const order = [];
	try {
		const current =
			eventSlug === null ? await listGeneralFields(db) : await listOwnFields(db, eventSlug);
		const byId = new Map(current.map((f) => [f.id, f]));
		const kept = new Set(wanted.map((w) => w.id).filter((id) => id !== null && byId.has(id)));
		// Primero las que se sacan, así una nueva entra aunque la lista estuviera llena.
		for (const f of current) {
			if (kept.has(f.id)) continue;
			const label = await deleteField(db, f.id, eventSlug, { by: admin.login });
			if (label) done.deleted.push(label);
		}
		for (const w of wanted) {
			const before = w.id !== null ? byId.get(w.id) : undefined;
			if (before && w.id !== null) {
				const same =
					before.label === w.field.label &&
					before.kind === w.field.kind &&
					before.required === w.field.required &&
					JSON.stringify(before.options) === JSON.stringify(w.field.options) &&
					Boolean(before.perTicket) === Boolean(w.field.perTicket) &&
					JSON.stringify(before.ticketTypes ?? []) ===
						JSON.stringify(eventSlug === null ? [] : w.field.ticketTypes);
				if (!same) {
					await updateField(db, w.id, eventSlug, w.field, { by: admin.login });
					done.updated.push(w.field.label);
				}
				order.push(w.id);
				continue;
			}
			const created = await createField(db, eventSlug, w.field, { by: admin.login });
			if (!created.ok) return fail(400, { fields: { ok: false, message: created.message } });
			done.created.push(w.field.label);
			order.push(created.id);
		}
		await setFieldPositions(db, eventSlug, order);
	} catch (e) {
		logDBError('guardar preguntas de inscripción', e);
		return fail(500, { fields: { ok: false, message: 'No se pudo guardar. Probá de nuevo.' } });
	}
	const parts = [
		done.created.length && `${done.created.length} nueva${done.created.length === 1 ? '' : 's'}`,
		done.updated.length && `${done.updated.length} cambiada${done.updated.length === 1 ? '' : 's'}`,
		done.deleted.length && `${done.deleted.length} borrada${done.deleted.length === 1 ? '' : 's'}`
	].filter(Boolean);
	await logAdminAction(db, event.locals, {
		action: 'signup_field.save',
		targetType: eventSlug ? 'event' : 'settings',
		targetId: eventSlug ?? 'signup_fields',
		summary: `Guardó las preguntas${eventSlug ? '' : ' generales'}${parts.length ? ` (${parts.join(', ')})` : ' (orden)'}`,
		detail: { order, ...done }
	});
	return {
		fields: {
			ok: true,
			message: done.deleted.length
				? 'Preguntas guardadas. Las que sacaste las recuperás desde Actividad; sus respuestas quedan en las órdenes.'
				: 'Preguntas guardadas.'
		}
	};
}

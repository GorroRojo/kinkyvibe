/**
 * Preguntas de inscripción (B8): lecturas y escrituras en D1 (migración 0018). Las reglas de
 * forma (tipos, largos, opciones, validar respuestas) están en src/lib/utils/signupFields.js.
 *
 * - `signup_fields`: cada pregunta; `event_slug` NULL = general.
 * - `event_signup_general`: qué generales usa cada evento.
 * - `order_answers`: las respuestas de cada orden (datos de quien compra: admins y, de su evento,
 *   les organizadores; ver src/lib/server/personas/organiza.js). Se
 *   escriben en la MISMA tanda que la orden (reserveOrder, `answersStatement`).
 *
 * Todo detrás del interruptor `personas_eventos`: apagado, {@link eventSignupFields} devuelve
 * `[]` y la compra queda como siempre.
 */
import { logDBError } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import {
	MAX_EVENT_FIELDS,
	MAX_GENERAL_FIELDS,
	fieldInputName,
	isFieldKind,
	parseOptions,
	parseStoredAnswers
} from '$lib/utils/signupFields.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('$lib/utils/signupFields.js').SignupField} SignupField */
/** @typedef {import('$lib/utils/signupFields.js').Answer} Answer */
/** @typedef {SignupField & { eventSlug: string | null, position: number, updatedAt: number, updatedBy: string }} StoredField */

const COLUMNS =
	'f.id, f.event_slug, f.label, f.kind, f.required, f.options, f.position, f.updated_at, f.updated_by';

/**
 * @param {Record<string, unknown>} r
 * @returns {StoredField}
 */
function rowToField(r) {
	/** @type {string[]} */
	let options = [];
	try {
		options = parseOptions(JSON.parse(String(r.options ?? '[]')));
	} catch {
		// JSON roto: sin opciones (la pregunta no se puede responder hasta que se arregle).
	}
	return {
		id: Number(r.id),
		eventSlug: r.event_slug == null ? null : String(r.event_slug),
		label: String(r.label),
		kind: isFieldKind(r.kind) ? r.kind : 'text',
		required: Number(r.required) === 1,
		options,
		position: Number(r.position ?? 0),
		updatedAt: Number(r.updated_at),
		updatedBy: String(r.updated_by ?? '')
	};
}

/**
 * Las preguntas generales.
 * @param {D1Database} db
 */
export async function listGeneralFields(db) {
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNS} FROM signup_fields f WHERE f.event_slug IS NULL ORDER BY f.position, f.id`
		)
		.all();
	return results.map(rowToField);
}

/**
 * Las preguntas propias de un evento.
 * @param {D1Database} db
 * @param {string} slug
 */
export async function listOwnFields(db, slug) {
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNS} FROM signup_fields f WHERE f.event_slug = ?1 ORDER BY f.position, f.id`
		)
		.bind(slug)
		.all();
	return results.map(rowToField);
}

/**
 * Los ids de las generales que usa un evento.
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<number[]>}
 */
export async function chosenGeneralIds(db, slug) {
	const { results } = await db
		.prepare('SELECT field_id FROM event_signup_general WHERE event_slug = ?1 ORDER BY position')
		.bind(slug)
		.all();
	return results.map((r) => Number(r.field_id));
}

/**
 * Todo lo que pregunta un evento al comprar, en orden: primero las generales que eligió,
 * después las propias. Sin mirar el interruptor (lo usa el panel).
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<StoredField[]>}
 */
export async function fieldsForEvent(db, slug) {
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNS}, 0 AS grp, g.position AS ord FROM event_signup_general g
				JOIN signup_fields f ON f.id = g.field_id AND f.event_slug IS NULL
				WHERE g.event_slug = ?1
			UNION ALL
			SELECT ${COLUMNS}, 1 AS grp, f.position AS ord FROM signup_fields f WHERE f.event_slug = ?1
			ORDER BY grp, ord, id`
		)
		.bind(slug)
		.all();
	return results.map(rowToField);
}

/**
 * Lo que pregunta el formulario de compra: `[]` con el interruptor apagado, sin base o si falla
 * (la compra sigue funcionando sin preguntas extra).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} slug
 * @returns {Promise<SignupField[]>}
 */
export async function eventSignupFields(db, slug) {
	if (!db || !(await isFlagOn(db, 'personas_eventos'))) return [];
	try {
		return (await fieldsForEvent(db, slug)).map(({ id, label, kind, required, options }) => ({
			id,
			label,
			kind,
			required,
			options
		}));
	} catch (error) {
		logDBError('preguntas de inscripción', error);
		return [];
	}
}

/**
 * Las respuestas del formulario, por `name` (solo los campos de estas preguntas, recortadas).
 *
 * @param {FormData} form
 * @param {readonly SignupField[]} fields
 * @returns {Record<string, string>}
 */
export function readAnswers(form, fields) {
	/** @type {Record<string, string>} */
	const out = {};
	for (const f of fields) {
		const name = fieldInputName(f.id);
		const v = form.get(name);
		if (typeof v === 'string') out[name] = v.slice(0, 2000);
	}
	return out;
}

/**
 * Crea una pregunta (general si `eventSlug` es null). Con tope por evento y de generales.
 *
 * @param {D1Database} db
 * @param {string | null} eventSlug
 * @param {Omit<SignupField, 'id'>} field ya validada (validateFieldDef)
 * @param {{ by: string, now?: number }} opts
 * @returns {Promise<{ ok: true, id: number } | { ok: false, message: string }>}
 */
export async function createField(db, eventSlug, field, { by, now = Date.now() }) {
	const max = eventSlug === null ? MAX_GENERAL_FIELDS : MAX_EVENT_FIELDS;
	const row = await db
		.prepare(
			`INSERT INTO signup_fields (event_slug, label, kind, required, options, position,
				created_at, updated_at, updated_by)
			SELECT ?1, ?2, ?3, ?4, ?5,
				(SELECT COALESCE(MAX(position), -1) + 1 FROM signup_fields WHERE event_slug IS ?1),
				?6, ?6, ?7
			WHERE (SELECT COUNT(*) FROM signup_fields WHERE event_slug IS ?1) < ?8
			RETURNING id`
		)
		.bind(
			eventSlug,
			field.label,
			field.kind,
			field.required ? 1 : 0,
			JSON.stringify(field.options),
			now,
			by,
			max
		)
		.first();
	if (!row) {
		return {
			ok: false,
			message:
				eventSlug === null
					? `Hasta ${MAX_GENERAL_FIELDS} preguntas generales.`
					: `Hasta ${MAX_EVENT_FIELDS} preguntas propias por evento.`
		};
	}
	return { ok: true, id: Number(row.id) };
}

/**
 * Borra una pregunta (de ese evento, o general con `eventSlug` null). Las respuestas ya
 * guardadas quedan (tienen la pregunta copiada). Devuelve la pregunta borrada, o `null`.
 *
 * @param {D1Database} db
 * @param {number} id
 * @param {string | null} eventSlug
 */
export async function deleteField(db, id, eventSlug) {
	if (!Number.isSafeInteger(id) || id <= 0) return null;
	const row = await db
		.prepare('DELETE FROM signup_fields WHERE id = ?1 AND event_slug IS ?2 RETURNING label')
		.bind(id, eventSlug)
		.first();
	return row ? String(row.label) : null;
}

/**
 * Elige qué preguntas generales usa un evento (reemplaza la elección anterior). Los ids que no
 * son de generales se ignoran. Devuelve cuántas quedaron elegidas.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {readonly number[]} ids
 */
export async function setChosenGeneral(db, slug, ids) {
	const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))].slice(
		0,
		MAX_GENERAL_FIELDS
	);
	const results = await db.batch([
		db.prepare('DELETE FROM event_signup_general WHERE event_slug = ?1').bind(slug),
		...unique.map((id, position) =>
			db
				.prepare(
					`INSERT INTO event_signup_general (event_slug, field_id, position)
					SELECT ?1, id, ?3 FROM signup_fields WHERE id = ?2 AND event_slug IS NULL`
				)
				.bind(slug, id, position)
		)
	]);
	// Cuántas quedaron elegidas (las que no eran generales no se insertan).
	return results.slice(1).reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}

/**
 * La sentencia que guarda las respuestas de una orden, para la MISMA tanda que la crea: solo
 * inserta si la orden quedó creada (la reserva puede no entrar por cupo o por los topes).
 *
 * @param {D1Database} db
 * @param {string} orderId
 * @param {readonly Answer[]} answers
 * @param {number} now
 * @returns {D1PreparedStatement}
 */
export function answersStatement(db, orderId, answers, now) {
	return db
		.prepare(
			`INSERT INTO order_answers (order_id, answers, created_at)
			SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM orders WHERE id = ?1)`
		)
		.bind(
			orderId,
			JSON.stringify(answers.map(({ id, label, value }) => ({ id, label, value }))),
			now
		);
}

/**
 * Las respuestas de las órdenes de un evento, por orden. Sin la migración o con un error, vacío
 * (el panel sigue andando).
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<Map<string, Answer[]>>}
 */
export async function answersByOrder(db, slug) {
	/** @type {Map<string, Answer[]>} */
	const out = new Map();
	try {
		const { results } = await db
			.prepare(
				`SELECT a.order_id, a.answers FROM order_answers a JOIN orders o ON o.id = a.order_id
				WHERE o.event_slug = ?1`
			)
			.bind(slug)
			.all();
		for (const r of results) out.set(String(r.order_id), parseStoredAnswers(r.answers));
	} catch (error) {
		logDBError('respuestas de las órdenes', error);
	}
	return out;
}

/**
 * Plantillas de los mails guardadas en D1.
 *
 * - General (`email_templates`, migraciones 0008 y 0034): una fila por mail que se cambió desde
 *   Mensajes → Plantillas; sin fila, el mail sale como siempre (el texto del código).
 * - Por evento (`event_email_templates`, migración 0034): una fila por evento y mail, con solo
 *   las partes que cambian para ese evento.
 *
 * Al mandar: lo del evento → la plantilla general → el texto del código ({@link resolveTemplate}).
 * El formato y las variables están en `$lib/utils/emailTemplates.js`.
 */
import {
	TEMPLATE_EXTRAS,
	TEMPLATE_KEYS,
	mergeTemplates,
	templateDef
} from '$lib/utils/emailTemplates.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/emailTemplates.js').TemplateId} TemplateId */
/** @typedef {import('$lib/utils/emailTemplates.js').TemplateText} TemplateText */
/** @typedef {import('$lib/utils/emailTemplates.js').TemplateParts} TemplateParts */
/**
 * @typedef {TemplateText & { id: TemplateId, updatedAt: number, updatedBy: string }} StoredTemplate
 * @typedef {TemplateParts & { id: TemplateId, updatedAt: number, updatedBy: string }} StoredEventTemplate
 */

/** @param {unknown} error */
const missingTable = (error) => error instanceof Error && /no such table/i.test(error.message);
/** Migración 0034 sin aplicar: la tabla general existe pero sin las columnas nuevas. */
/** @param {unknown} error */
const missingColumn = (error) => error instanceof Error && /no such column/i.test(error.message);

const EXTRA_COLUMNS = TEMPLATE_EXTRAS.join(', ');
const ALL_COLUMNS = TEMPLATE_KEYS.join(', ');

/**
 * Las partes opcionales con texto (las vacías o NULL no van).
 * @param {Record<string, unknown>} row
 */
function extrasOf(row) {
	/** @type {Partial<Record<import('$lib/utils/emailTemplates.js').ExtraKey, string>>} */
	const out = {};
	for (const k of TEMPLATE_EXTRAS) {
		const v = row[k];
		if (typeof v === 'string' && v.trim()) out[k] = v;
	}
	return out;
}

/**
 * Todas las partes con texto de una fila de `event_email_templates`.
 * @param {Record<string, unknown>} row
 * @returns {TemplateParts}
 */
function partsOf(row) {
	/** @type {TemplateParts} */
	const out = {};
	for (const k of TEMPLATE_KEYS) {
		const v = row[k];
		if (typeof v === 'string' && v.trim()) out[k] = v;
	}
	return out;
}

/** '' → NULL (sin texto propio). @param {string | null | undefined} v */
const orNull = (v) => (typeof v === 'string' && v.trim() ? v : null);

/**
 * SELECT a `email_templates` con las columnas nuevas; sin la migración 0034, sin ellas.
 * @param {D1Database} db
 * @param {string} where
 * @param {unknown[]} args
 */
async function selectGeneral(db, where, args) {
	const base = 'id, subject, heading, body, updated_at, updated_by';
	try {
		return (
			await db
				.prepare(`SELECT ${base}, ${EXTRA_COLUMNS} FROM email_templates ${where}`)
				.bind(...args)
				.all()
		).results;
	} catch (error) {
		if (!missingColumn(error)) throw error;
		return (
			await db
				.prepare(`SELECT ${base} FROM email_templates ${where}`)
				.bind(...args)
				.all()
		).results;
	}
}

/**
 * Todas las plantillas guardadas (sin la tabla, ninguna).
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<Map<TemplateId, StoredTemplate>>}
 */
export async function listTemplateOverrides(db) {
	/** @type {Map<TemplateId, StoredTemplate>} */
	const out = new Map();
	if (!db) return out;
	try {
		for (const r of await selectGeneral(db, '', [])) {
			const def = templateDef(r.id);
			if (!def) continue;
			out.set(def.id, {
				id: def.id,
				subject: String(r.subject),
				heading: String(r.heading),
				body: String(r.body),
				...extrasOf(r),
				updatedAt: Number(r.updated_at),
				updatedBy: String(r.updated_by)
			});
		}
	} catch (error) {
		if (!missingTable(error)) throw error;
	}
	return out;
}

/**
 * La plantilla general de un mail, o `null` (sin guardar, sin base o si falla la lectura: nunca
 * frena un mail; en ese caso sale el texto de siempre).
 *
 * @param {D1Database | null | undefined} db
 * @param {TemplateId} id
 * @returns {Promise<TemplateText | null>}
 */
export async function getTemplateOverride(db, id) {
	if (!db) return null;
	try {
		const [r] = await selectGeneral(db, 'WHERE id = ?1', [id]);
		return r
			? {
					subject: String(r.subject),
					heading: String(r.heading),
					body: String(r.body),
					...extrasOf(r)
				}
			: null;
	} catch (error) {
		if (!missingTable(error)) console.error(`[tickets] no se pudo leer la plantilla ${id}:`, error);
		return null;
	}
}

/**
 * Guarda (o reemplaza) la plantilla general de un mail. Ya validada con `validateTemplate`.
 *
 * @param {D1Database} db
 * @param {TemplateId} id
 * @param {TemplateText} value
 * @param {{ by: string, now?: number }} meta
 */
export async function saveTemplateOverride(db, id, value, { by, now = Date.now() }) {
	await db
		.prepare(
			`INSERT INTO email_templates (id, subject, heading, body, label, button, help, why,
				updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
			ON CONFLICT (id) DO UPDATE SET subject = ?2, heading = ?3, body = ?4, label = ?5,
				button = ?6, help = ?7, why = ?8, updated_at = ?9, updated_by = ?10`
		)
		.bind(
			id,
			value.subject,
			value.heading,
			value.body,
			orNull(value.label),
			orNull(value.button),
			orNull(value.help),
			orNull(value.why),
			now,
			by
		)
		.run();
}

/**
 * "Restaurar el original": borra la plantilla guardada. Devuelve si había una.
 *
 * @param {D1Database} db
 * @param {TemplateId} id
 */
export async function deleteTemplateOverride(db, id) {
	const res = await db.prepare('DELETE FROM email_templates WHERE id = ?1').bind(id).run();
	return res.meta.changes > 0;
}

/**
 * Lo que cambia en los mails de un evento (sin la tabla, nada).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} eventSlug
 * @returns {Promise<Map<TemplateId, StoredEventTemplate>>}
 */
export async function listEventTemplateOverrides(db, eventSlug) {
	/** @type {Map<TemplateId, StoredEventTemplate>} */
	const out = new Map();
	if (!db) return out;
	try {
		const { results } = await db
			.prepare(
				`SELECT id, ${ALL_COLUMNS}, updated_at, updated_by FROM event_email_templates
				WHERE event_slug = ?1`
			)
			.bind(eventSlug)
			.all();
		for (const r of results) {
			const def = templateDef(r.id);
			if (!def) continue;
			out.set(def.id, {
				id: def.id,
				...partsOf(r),
				updatedAt: Number(r.updated_at),
				updatedBy: String(r.updated_by)
			});
		}
	} catch (error) {
		if (!missingTable(error)) throw error;
	}
	return out;
}

/**
 * Lo que cambia en un mail de un evento, o `null` (sin cambios, sin base o si falla la lectura:
 * nunca frena un mail).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} eventSlug
 * @param {TemplateId} id
 * @returns {Promise<TemplateParts | null>}
 */
export async function getEventTemplateOverride(db, eventSlug, id) {
	if (!db || !eventSlug) return null;
	try {
		const r = await db
			.prepare(`SELECT ${ALL_COLUMNS} FROM event_email_templates WHERE event_slug = ?1 AND id = ?2`)
			.bind(eventSlug, id)
			.first();
		if (!r) return null;
		const parts = partsOf(r);
		return Object.keys(parts).length ? parts : null;
	} catch (error) {
		if (!missingTable(error))
			console.error(`[tickets] no se pudo leer la plantilla ${id} de ${eventSlug}:`, error);
		return null;
	}
}

/**
 * Guarda lo que cambia en un mail de un evento (validado con `validateTemplate(…, { optional:
 * true })`). Si todo quedó vacío, borra la fila (el evento vuelve a la plantilla general).
 * Devuelve si quedó algo guardado.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {TemplateId} id
 * @param {TemplateParts} value
 * @param {{ by: string, now?: number }} meta
 */
export async function saveEventTemplateOverride(
	db,
	eventSlug,
	id,
	value,
	{ by, now = Date.now() }
) {
	const cols = TEMPLATE_KEYS.map((k) => orNull(value[k]));
	if (cols.every((v) => v === null)) {
		await deleteEventTemplateOverride(db, eventSlug, id);
		return false;
	}
	await db
		.prepare(
			`INSERT INTO event_email_templates (event_slug, id, ${ALL_COLUMNS}, updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
			ON CONFLICT (event_slug, id) DO UPDATE SET subject = ?3, heading = ?4, body = ?5,
				label = ?6, button = ?7, help = ?8, why = ?9, updated_at = ?10, updated_by = ?11`
		)
		.bind(eventSlug, id, ...cols, now, by)
		.run();
	return true;
}

/**
 * Borra lo que cambia en un mail de un evento. Devuelve si había algo.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {TemplateId} id
 */
export async function deleteEventTemplateOverride(db, eventSlug, id) {
	const res = await db
		.prepare('DELETE FROM event_email_templates WHERE event_slug = ?1 AND id = ?2')
		.bind(eventSlug, id)
		.run();
	return res.meta.changes > 0;
}

/**
 * La plantilla con la que sale un mail de un evento: lo del evento → la general → (lo que falte)
 * el texto del código. `null` si no hay nada guardado (el mail sale como siempre).
 *
 * @param {D1Database | null | undefined} db
 * @param {string | null | undefined} eventSlug
 * @param {TemplateId} id
 * @returns {Promise<TemplateParts | null>}
 */
export async function resolveTemplate(db, eventSlug, id) {
	const [event, general] = await Promise.all([
		eventSlug ? getEventTemplateOverride(db, eventSlug, id) : null,
		getTemplateOverride(db, id)
	]);
	return mergeTemplates(event, general);
}

/**
 * Plantillas de los mails guardadas en D1 (`email_templates`, migración 0008). Una fila por mail
 * que se cambió desde el panel; sin fila, el mail sale como siempre (el texto del código).
 * El formato y las variables están en `$lib/utils/emailTemplates.js`.
 */
import { templateDef } from '$lib/utils/emailTemplates.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/emailTemplates.js').TemplateId} TemplateId */
/** @typedef {import('$lib/utils/emailTemplates.js').TemplateText} TemplateText */
/**
 * @typedef {TemplateText & { id: TemplateId, updatedAt: number, updatedBy: string }} StoredTemplate
 */

/** @param {unknown} error */
const missingTable = (error) => error instanceof Error && /no such table/i.test(error.message);

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
		const { results } = await db
			.prepare('SELECT id, subject, heading, body, updated_at, updated_by FROM email_templates')
			.all();
		for (const r of results) {
			const def = templateDef(r.id);
			if (!def) continue;
			out.set(def.id, {
				id: def.id,
				subject: String(r.subject),
				heading: String(r.heading),
				body: String(r.body),
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
 * La plantilla de un mail, o `null` (sin guardar, sin base o si falla la lectura: nunca frena un
 * mail; en ese caso sale el texto de siempre).
 *
 * @param {D1Database | null | undefined} db
 * @param {TemplateId} id
 * @returns {Promise<TemplateText | null>}
 */
export async function getTemplateOverride(db, id) {
	if (!db) return null;
	try {
		const r = await db
			.prepare('SELECT subject, heading, body FROM email_templates WHERE id = ?1')
			.bind(id)
			.first();
		return r
			? { subject: String(r.subject), heading: String(r.heading), body: String(r.body) }
			: null;
	} catch (error) {
		if (!missingTable(error)) console.error(`[tickets] no se pudo leer la plantilla ${id}:`, error);
		return null;
	}
}

/**
 * Guarda (o reemplaza) la plantilla de un mail. Ya validada con `validateTemplate`.
 *
 * @param {D1Database} db
 * @param {TemplateId} id
 * @param {TemplateText} value
 * @param {{ by: string, now?: number }} meta
 */
export async function saveTemplateOverride(db, id, value, { by, now = Date.now() }) {
	await db
		.prepare(
			`INSERT INTO email_templates (id, subject, heading, body, updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6)
			ON CONFLICT (id) DO UPDATE SET subject = ?2, heading = ?3, body = ?4, updated_at = ?5,
				updated_by = ?6`
		)
		.bind(id, value.subject, value.heading, value.body, now, by)
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

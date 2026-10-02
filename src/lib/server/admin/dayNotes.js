/**
 * Notas en los días de la agenda (tabla `agenda_day_notes`, migración 0030). Solo para admins:
 * las lee y escribe /admin/eventos/agenda (cada action llama a `requireAdmin`). Nunca se usan en
 * páginas públicas ni en el .ics. La validación y la paleta están en `$lib/utils/dayNotes.js`.
 * Si la tabla todavía no existe (migración sin aplicar), la lista sale vacía.
 */
import { dayNoteColor } from '$lib/utils/dayNotes.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/dayNotes.js').DayNote} DayNote */

/** @param {Record<string, unknown>} r @returns {DayNote} */
function toNote(r) {
	return {
		id: Number(r.id),
		date: String(r.date),
		body: String(r.body),
		color: dayNoteColor(r.color),
		updatedAt: Number(r.updated_at),
		updatedBy: String(r.updated_by)
	};
}

const COLUMNS = 'id, date, body, color, updated_at, updated_by';

/**
 * Las notas desde un día (incluido), por día y en el orden en que se cargaron.
 * @param {D1Database | null | undefined} db
 * @param {{ from?: string }} [options] YYYY-MM-DD
 * @returns {Promise<DayNote[]>}
 */
export async function listDayNotes(db, { from = '0000-00-00' } = {}) {
	if (!db) return [];
	try {
		const { results } = await db
			.prepare(`SELECT ${COLUMNS} FROM agenda_day_notes WHERE date >= ?1 ORDER BY date, id`)
			.bind(from)
			.all();
		return results.map(toNote);
	} catch (error) {
		if (error instanceof Error && /no such table/i.test(error.message)) return [];
		throw error;
	}
}

/**
 * @param {D1Database} db
 * @param {number} id
 * @returns {Promise<DayNote | null>}
 */
export async function getDayNote(db, id) {
	const r = await db
		.prepare(`SELECT ${COLUMNS} FROM agenda_day_notes WHERE id = ?1`)
		.bind(id)
		.first();
	return r ? toNote(r) : null;
}

/**
 * Agrega una nota (ya validada).
 * @param {D1Database} db
 * @param {{ date: string, body: string, color: string, by: string, now?: number }} input
 * @returns {Promise<DayNote>}
 */
export async function addDayNote(db, { date, body, color, by, now = Date.now() }) {
	const r = await db
		.prepare(
			`INSERT INTO agenda_day_notes (date, body, color, created_at, created_by, updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?5) RETURNING ${COLUMNS}`
		)
		.bind(date, body, color, now, by)
		.first();
	if (!r) throw new Error('No se pudo guardar la nota.');
	return toNote(r);
}

/**
 * Cambia una nota (ya validada). null si no existe.
 * @param {D1Database} db
 * @param {{ id: number, date: string, body: string, color: string, by: string, now?: number }} input
 * @returns {Promise<DayNote | null>}
 */
export async function updateDayNote(db, { id, date, body, color, by, now = Date.now() }) {
	const r = await db
		.prepare(
			`UPDATE agenda_day_notes SET date = ?2, body = ?3, color = ?4, updated_at = ?5, updated_by = ?6
			WHERE id = ?1 RETURNING ${COLUMNS}`
		)
		.bind(id, date, body, color, now, by)
		.first();
	return r ? toNote(r) : null;
}

/**
 * Borra una nota. false si ya no estaba.
 * @param {D1Database} db
 * @param {number} id
 */
export async function deleteDayNote(db, id) {
	const res = await db.prepare('DELETE FROM agenda_day_notes WHERE id = ?1').bind(id).run();
	return res.meta.changes === 1;
}

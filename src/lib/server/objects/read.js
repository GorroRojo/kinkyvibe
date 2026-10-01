/**
 * Lecturas de objetos. Todas filtran con el helper de visibilidad (./visibility.js): si quien
 * mira no puede ver el objeto, es como si no existiera (null), para no revelar que existe.
 *
 * Solo usa imports relativos.
 */
import { canSee, isAdmin, visibleWhere } from './visibility.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./visibility.js').Viewer} Viewer */
/** @typedef {import('./visibility.js').Visibility} Visibility */

/**
 * @typedef {{
 *   id: number,
 *   type: string,
 *   slug: string,
 *   title: string,
 *   data: Record<string, any>,
 *   visibility: Visibility,
 *   version: number,
 *   created_at: number,
 *   created_by: string,
 *   updated_at: number,
 *   updated_by: string,
 *   deleted_at: number | null
 * }} StoredObject
 */

/** Columnas que se leen (sin search_text, que es solo para el índice). */
export const OBJECT_COLUMNS =
	'id, type, slug, title, data, visibility, version, created_at, created_by, updated_at, updated_by, deleted_at';

/**
 * @param {Record<string, unknown>} row
 * @returns {StoredObject}
 */
export function rowToObject(row) {
	let data = {};
	try {
		data = JSON.parse(String(row.data ?? '{}'));
	} catch {
		data = {}; // no debería pasar (CHECK json_valid); el chequeo nocturno lo reporta
	}
	return /** @type {StoredObject} */ ({
		...row,
		id: Number(row.id),
		version: Number(row.version),
		data,
		deleted_at: row.deleted_at == null ? null : Number(row.deleted_at)
	});
}

/**
 * Quién creó y quién editó un objeto (`created_by`, `updated_by`) es dato de admins: a cualquier
 * otre se le devuelven vacíos. Así ninguna lectura pública o de cuentas puede vincular dos
 * objetos por su autore (por ejemplo, dos perfiles de personas de una misma cuenta, decisión
 * A2). La regla de "quien lo creó ve su oculto" se aplica antes, con la fila completa.
 *
 * @param {StoredObject} object
 * @param {Viewer | null | undefined} viewer
 * @returns {StoredObject}
 */
export function forViewer(object, viewer) {
	return isAdmin(viewer) ? object : { ...object, created_by: '', updated_by: '' };
}

/**
 * Un objeto por id o por (tipo, slug), si quien mira lo puede ver.
 *
 * @param {D1Database} db
 * @param {{ id: number } | { type: string, slug: string }} ref
 * @param {Viewer | null | undefined} viewer
 * @param {{ includeDeleted?: boolean }} [options] solo para admins (deshacer un borrado)
 * @returns {Promise<StoredObject | null>}
 */
export async function getObject(db, ref, viewer, options = {}) {
	const row =
		'id' in ref
			? await db.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE id = ?1`).bind(ref.id).first()
			: await db
					.prepare(`SELECT ${OBJECT_COLUMNS} FROM objects WHERE type = ?1 AND slug = ?2`)
					.bind(ref.type, ref.slug)
					.first();
	if (!row) return null;
	const object = rowToObject(row);
	return canSee(object, viewer, options) ? forViewer(object, viewer) : null;
}

/**
 * Búsqueda de texto completo, filtrada por visibilidad en la misma consulta.
 *
 * @param {D1Database} db
 * @param {string} text lo que escribió la persona (se busca cada palabra como prefijo)
 * @param {Viewer | null | undefined} viewer
 * @param {{ type?: string, limit?: number }} [options]
 * @returns {Promise<StoredObject[]>}
 */
export async function searchObjects(db, text, viewer, { type, limit = 20 } = {}) {
	// Cada palabra entre comillas (sin operadores de FTS5 que vengan del pedido) y como prefijo.
	const terms = String(text ?? '')
		.split(/\s+/)
		.map((w) => w.replaceAll('"', '').trim())
		.filter(Boolean)
		.slice(0, 8)
		.map((w) => `"${w}"*`);
	if (!terms.length) return [];
	const cols = OBJECT_COLUMNS.split(', ')
		.map((c) => `o.${c}`)
		.join(', ');
	const visible = visibleWhere(viewer, 'o');
	// Solo `?` sin número: visibleWhere agrega los suyos en el medio.
	const { results } = await db
		.prepare(
			`SELECT ${cols} FROM objects_fts f JOIN objects o ON o.id = f.rowid
			 WHERE objects_fts MATCH ? AND ${visible.sql}
			 AND (? IS NULL OR o.type = ?)
			 ORDER BY f.rank LIMIT ?`
		)
		.bind(
			terms.join(' '),
			...visible.params,
			type ?? null,
			type ?? null,
			Math.min(Math.max(1, limit), 100)
		)
		.all();
	return results.map((r) => forViewer(rowToObject(r), viewer));
}

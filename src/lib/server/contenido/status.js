/**
 * Estado del contenido en la base, para el panel (Contenido → En la base): qué se importó, qué
 * coincide con su .md y qué no. Arma todo con lo que ya calculó la importación sin escribir
 * ({@link import('./importer.js').planImport}), más una consulta.
 *
 * Solo imports relativos.
 */
import { CONTENT_CATEGORIES } from './categories.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./importer.js').ImportRow} ImportRow */

/**
 * @typedef {{
 *   files: number,
 *   imported: number,
 *   same: number,
 *   drift: number,
 *   pending: number,
 *   edited: number,
 *   deleted: number,
 *   problems: number,
 *   onlyInDb: number
 * }} ContentStatus
 */

/**
 * Cuenta las filas de una importación planeada.
 *
 * - `same`: importados, sin cambios en el .md y con los mismos datos (paridad);
 * - `drift`: importados y sin cambios en el .md, pero los datos no coinciden con lo que daría
 *   importarlo hoy (cambió el código que lee los .md): hay que mirarlos;
 * - `pending`: nuevos o con el .md cambiado (los hace la próxima importación);
 * - `edited`/`deleted`: editados o borrados en el panel (la importación no los toca);
 * - `problems`: no se pueden importar (frontmatter roto o datos inválidos): siguen saliendo del .md.
 *
 * @param {ImportRow[]} rows
 * @param {number} onlyInDb objetos del tipo que no salieron de un .md (creados en el panel)
 * @returns {ContentStatus}
 */
export function summarizeStatus(rows, onlyInDb = 0) {
	const s = {
		files: rows.length,
		imported: 0,
		same: 0,
		drift: 0,
		pending: 0,
		edited: 0,
		deleted: 0,
		problems: 0,
		onlyInDb
	};
	for (const r of rows) {
		if (r.objectId !== null && r.action !== 'created') s.imported++;
		if (r.action === 'unchanged') {
			if (r.changed.length) s.drift++;
			else s.same++;
		} else if (r.action === 'created' || r.action === 'updated') s.pending++;
		else if (r.action === 'skipped_edited') s.edited++;
		else if (r.action === 'skipped_deleted') s.deleted++;
		else s.problems++;
	}
	return s;
}

/**
 * Cuántos objetos de la categoría no salieron de un .md (los crea el panel).
 *
 * @param {D1Database} db
 * @param {string} category
 */
export async function countOnlyInDb(db, category) {
	const type = CONTENT_CATEGORIES[category]?.type;
	if (!type) return 0;
	const row = await db
		.prepare(
			`SELECT count(*) AS n FROM objects o
			WHERE o.type = ?1 AND o.deleted_at IS NULL
			AND NOT EXISTS (SELECT 1 FROM content_sources s WHERE s.object_id = o.id)`
		)
		.bind(type)
		.first();
	return Number(row?.n ?? 0);
}

/**
 * Las categorías del panel (Contenido → En la base), con sus nombres para mostrar.
 * @type {ReadonlyArray<{ key: string, title: string, one: string, many: string }>}
 */
export const IMPORT_CATEGORIES = Object.freeze([
	{ key: 'calendario', title: 'Eventos', one: 'evento', many: 'eventos' },
	{
		key: 'material',
		title: 'Material',
		one: 'publicación de material',
		many: 'publicaciones de material'
	}
]);

/** Qué quiere decir cada acción, para el panel y el CSV. */
export const ACTION_LABELS = Object.freeze({
	created: 'se crea',
	updated: 'se actualiza (cambió el .md)',
	unchanged: 'sin cambios',
	skipped_edited: 'editado en el panel: no se pisa',
	skipped_deleted: 'borrado en el panel: no se revive',
	invalid: 'no se puede leer (el sitio tampoco lo muestra)',
	error: 'no se puede importar'
});

/**
 * Columnas del CSV de la importación.
 *
 * @type {import('$lib/admin/csv.js').CsvColumn<ImportRow>[]}
 */
export const IMPORT_CSV = [
	{ key: 'legacySlug', label: 'Archivo' },
	{ key: 'title', label: 'Título' },
	{ label: 'Qué pasa', value: (r) => ACTION_LABELS[r.action] ?? r.action },
	{ key: 'slug', label: 'Dirección en la base' },
	{ label: 'Campos distintos', value: (r) => r.changed.join(' ') },
	{ label: 'Avisos', value: (r) => r.warnings.join(' · ') },
	{ label: 'Error', value: (r) => r.message ?? '' }
];

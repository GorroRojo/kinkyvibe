/**
 * Historial del contenido (decisión 0004: «historial: todo, para siempre»; «guardar escribe
 * siempre una versión nueva, nunca pisa»).
 *
 * Cada guardado de contenido (importar un .md, editar en el panel, borrar, deshacer) va con
 * {@link revisionStatement} en la opción `also` de saveObject(): en la MISMA tanda, después de
 * escribir el objeto, copia la fila tal como quedó a `object_revisions` (migración 0031). Si algo
 * falla, no se guarda nada.
 *
 * Solo imports relativos.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('../objects/save.js').SavedRef} SavedRef */

/** De dónde vino un guardado. */
export const REVISION_SOURCES = /** @type {const} */ (['import', 'panel', 'agenda', 'deshacer']);

/**
 * La sentencia que copia el objeto recién guardado al historial. Va al final de `also` (después
 * del INSERT/UPDATE del objeto en la tanda, así lee la fila ya escrita).
 *
 * @param {D1Database} db
 * @param {SavedRef} self lo que recibe `also`
 * @param {(typeof REVISION_SOURCES)[number]} source
 */
export function revisionStatement(db, self, source) {
	return db
		.prepare(
			`INSERT INTO object_revisions (object_id, version, slug, title, data, visibility, deleted_at,
				saved_at, saved_by, source)
			SELECT id, version, slug, title, data, visibility, deleted_at, updated_at, updated_by, ?4
			FROM objects WHERE (?1 IS NOT NULL AND id = ?1) OR (?1 IS NULL AND type = ?2 AND slug = ?3)`
		)
		.bind(self.id, self.type, self.slug, source);
}

/**
 * @typedef {{
 *   version: number, slug: string, title: string, data: Record<string, unknown>,
 *   visibility: string, deleted: boolean, savedAt: number, savedBy: string, source: string
 * }} Revision
 */

/**
 * El historial de un objeto, de la versión más nueva a la más vieja. Solo para el panel (admins):
 * quien llama ya verificó el acceso.
 *
 * @param {D1Database} db
 * @param {number} objectId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Revision[]>}
 */
export async function listRevisions(db, objectId, { limit = 50 } = {}) {
	const { results } = await db
		.prepare(
			`SELECT version, slug, title, data, visibility, deleted_at, saved_at, saved_by, source
			FROM object_revisions WHERE object_id = ?1 ORDER BY version DESC LIMIT ?2`
		)
		.bind(objectId, Math.min(Math.max(1, limit), 500))
		.all();
	return results.map((r) => {
		let data = {};
		try {
			data = JSON.parse(String(r.data));
		} catch {
			data = {};
		}
		return {
			version: Number(r.version),
			slug: String(r.slug),
			title: String(r.title),
			data: /** @type {Record<string, unknown>} */ (data),
			visibility: String(r.visibility),
			deleted: r.deleted_at != null,
			savedAt: Number(r.saved_at),
			savedBy: String(r.saved_by),
			source: String(r.source)
		};
	});
}

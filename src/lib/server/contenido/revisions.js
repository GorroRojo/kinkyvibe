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
export const REVISION_SOURCES = /** @type {const} */ ([
	'import',
	'panel',
	'agenda',
	'deshacer',
	'lugar',
	'partes',
	'migracion',
	// Los eventos de prueba del modo demo (src/lib/server/demo/seedEvents.js), solo en un preview.
	'demo',
	// Un cambio del conector de Claude (docs/conector-claude.md): `saved_by` es le admin que lo
	// autorizó y `confirmed_by`, si vino, quién del equipo lo confirmó (migración 0072).
	'claude'
]);

/**
 * Las relaciones del objeto `alias` como quedan en el historial (columna `edges`, migración 0073):
 * una lista JSON de `{ kind, to, position, data, slug, key }`, con la dirección (y el nombre, si es
 * una etiqueta) del objeto al que apunta cada una. Así volver a una versión (deshacer, ver
 * docs/conector-claude.md) puede devolver las etiquetas, las personas, la imagen y el lugar.
 *
 * @param {string} alias el alias de `objects` en la consulta de afuera
 */
export function edgesSnapshotSql(alias) {
	return `(SELECT json_group_array(json_object('kind', e.kind, 'to', e.to_id, 'position', e.position,
			'data', json(e.data), 'slug', t.slug, 'key', json_extract(t.data, '$.key')))
		FROM (SELECT * FROM edges WHERE from_id = ${alias}.id ORDER BY kind, position, id) e
		JOIN objects t ON t.id = e.to_id)`;
}

/**
 * La sentencia que copia el objeto recién guardado al historial, con sus relaciones. Va al final
 * de `also` (después del INSERT/UPDATE del objeto y de sus edges en la tanda, así lee la fila ya
 * escrita).
 *
 * @param {D1Database} db
 * @param {SavedRef} self lo que recibe `also`
 * @param {(typeof REVISION_SOURCES)[number]} source
 * @param {string | null} [confirmedBy] solo con `source` = 'claude': quién confirmó el cambio
 */
export function revisionStatement(db, self, source, confirmedBy = null) {
	return db
		.prepare(
			`INSERT INTO object_revisions (object_id, version, slug, title, data, visibility, deleted_at,
				saved_at, saved_by, source, confirmed_by, edges)
			SELECT o.id, o.version, o.slug, o.title, o.data, o.visibility, o.deleted_at, o.updated_at,
				o.updated_by, ?4, ?5, ${edgesSnapshotSql('o')}
			FROM objects o
			WHERE (?1 IS NOT NULL AND o.id = ?1) OR (?1 IS NULL AND o.type = ?2 AND o.slug = ?3)`
		)
		.bind(self.id, self.type, self.slug, source, source === 'claude' ? confirmedBy || null : null);
}

/**
 * Quién hizo un guardado, para mostrar: «Claude, confirmado por Mel» o «Claude» en un cambio del
 * conector (más le admin que lo autorizó, si se pide), y el login de siempre en todo lo demás.
 *
 * @param {{ savedBy: string, source: string, confirmedBy?: string | null }} r
 * @param {{ withAdmin?: boolean }} [opts] sumar «(autorizó @login)» en los de Claude
 */
export function revisionAuthorLabel(r, { withAdmin = false } = {}) {
	if (r.source !== 'claude') return r.savedBy ? `@${r.savedBy}` : '—';
	const who = r.confirmedBy ? `Claude, confirmado por ${r.confirmedBy}` : 'Claude';
	return withAdmin && r.savedBy ? `${who} (autorizó @${r.savedBy})` : who;
}

/**
 * @typedef {{
 *   version: number, slug: string, title: string, data: Record<string, unknown>,
 *   visibility: string, deleted: boolean, savedAt: number, savedBy: string, source: string,
 *   confirmedBy: string | null, edges: RevisionEdge[] | null
 * }} Revision
 *
 * `edges`: las relaciones como quedaron en ese guardado (`null` en lo guardado antes de la
 * migración 0073).
 *
 * @typedef {{ kind: string, to: number, position: number, data: Record<string, unknown> | null, slug: string, key: string | null }} RevisionEdge
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
			`SELECT ${REVISION_COLUMNS}
			FROM object_revisions WHERE object_id = ?1 ORDER BY version DESC LIMIT ?2`
		)
		.bind(objectId, Math.min(Math.max(1, limit), 500))
		.all();
	return results.map(rowToRevision);
}

/**
 * Una versión del historial de un objeto, o `null` si no está.
 *
 * @param {D1Database} db
 * @param {number} objectId
 * @param {number} version
 * @returns {Promise<Revision | null>}
 */
export async function getRevision(db, objectId, version) {
	const row = await db
		.prepare(
			`SELECT ${REVISION_COLUMNS} FROM object_revisions WHERE object_id = ?1 AND version = ?2`
		)
		.bind(objectId, version)
		.first();
	return row ? rowToRevision(row) : null;
}

const REVISION_COLUMNS = `version, slug, title, data, visibility, deleted_at, saved_at, saved_by,
	source, confirmed_by, edges`;

/** @param {unknown} raw @returns {RevisionEdge[] | null} */
function parseEdges(raw) {
	if (raw == null) return null;
	try {
		const list = JSON.parse(String(raw));
		if (!Array.isArray(list)) return null;
		return list
			.filter((e) => e && typeof e === 'object' && typeof e.kind === 'string')
			.map((e) => ({
				kind: String(e.kind),
				to: Number(e.to),
				position: Number(e.position) || 0,
				data: e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? e.data : null,
				slug: String(e.slug ?? ''),
				key: typeof e.key === 'string' ? e.key : null
			}));
	} catch {
		return null;
	}
}

/**
 * @param {Record<string, unknown>} r
 * @returns {Revision}
 */
function rowToRevision(r) {
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
		source: String(r.source),
		confirmedBy: r.confirmed_by == null ? null : String(r.confirmed_by),
		edges: parseEdges(r.edges)
	};
}

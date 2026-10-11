/**
 * Leer las etiquetas de la base como registros (src/lib/server/etiquetas/model.js): todas las
 * que quien mira puede ver, con sus relaciones entre ellas. Una relación solo cuenta si se ven
 * las dos puntas (docs/objetos.md, regla 2): se lee con `visibleWhere()` en las dos.
 *
 * Solo imports relativos (lo usa el script de Node).
 */
import { ANON, visibleWhere } from '../objects/visibility.js';
import { TAG_TYPE } from '../objects/types/etiqueta.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./model.js').TagRecord} TagRecord */

/**
 * @param {D1Database} db
 * @param {import('../objects/visibility.js').Viewer} [viewer] por defecto, el público
 * @returns {Promise<(TagRecord & { id: number, slug: string, version: number })[]>}
 */
export async function loadTagRecords(db, viewer = ANON) {
	const [objects, relations] = tagRecordsStatements(db, viewer);
	const { results: objs } = await objects.all();
	const { results: edges } = await relations.all();
	return readTagRecords(objs, edges);
}

/**
 * Las dos consultas de {@link loadTagRecords} (las etiquetas y sus relaciones), para correrlas en
 * una tanda (`runQueries`, src/lib/server/db/batch.js) con {@link readTagRecords}.
 * @param {D1Database} db
 * @param {import('../objects/visibility.js').Viewer} [viewer]
 */
export function tagRecordsStatements(db, viewer = ANON) {
	const vo = visibleWhere(viewer, 'o');
	const a = visibleWhere(viewer, 'a');
	const b = visibleWhere(viewer, 'b');
	return [
		db
			.prepare(
				`SELECT o.id, o.slug, o.title, o.data, o.version FROM objects o
			WHERE o.type = ? AND ${vo.sql} ORDER BY o.id`
			)
			.bind(TAG_TYPE, ...vo.params),
		db
			.prepare(
				`SELECT e.from_id, e.kind, e.to_id, e.position, e.data FROM edges e
			JOIN objects a ON a.id = e.from_id JOIN objects b ON b.id = e.to_id
			WHERE a.type = ? AND b.type = ? AND e.kind IN ('hijo_de', 'relacionada_con', 'alias_de')
				AND ${a.sql} AND ${b.sql}
			ORDER BY e.from_id, e.kind, e.position`
			)
			.bind(TAG_TYPE, TAG_TYPE, ...a.params, ...b.params)
	];
}

/**
 * Los registros a partir de las filas de {@link tagRecordsStatements}.
 * @param {Record<string, unknown>[]} objs
 * @param {Record<string, unknown>[]} edges
 * @returns {(TagRecord & { id: number, slug: string, version: number })[]}
 */
export function readTagRecords(objs, edges) {
	/** @type {Map<number, TagRecord & { id: number, slug: string, version: number }>} */
	const byId = new Map();
	for (const o of objs) {
		/** @type {Record<string, unknown>} */
		let data = {};
		try {
			data = JSON.parse(String(o.data));
		} catch {
			continue;
		}
		const { key, ...rest } = data;
		if (typeof key !== 'string' || !key) continue;
		byId.set(Number(o.id), {
			id: Number(o.id),
			slug: String(o.slug),
			version: Number(o.version),
			key,
			title: String(o.title),
			data: rest,
			parents: [],
			related: [],
			aliasOf: null
		});
	}
	for (const e of edges) {
		const from = byId.get(Number(e.from_id));
		const to = byId.get(Number(e.to_id));
		if (!from || !to) continue;
		if (e.kind === 'hijo_de') {
			let orden = Number(e.position);
			try {
				const d = e.data ? JSON.parse(String(e.data)) : null;
				if (Number.isFinite(d?.orden)) orden = Number(d.orden);
			} catch {
				// sin orden: el de la relación
			}
			from.parents.push({ key: to.key, orden });
		} else if (e.kind === 'relacionada_con') from.related.push(to.key);
		else if (e.kind === 'alias_de') from.aliasOf = to.key;
	}
	return [...byId.values()];
}

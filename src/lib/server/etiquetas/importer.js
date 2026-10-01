/**
 * Importación de las etiquetas (src/lib/utils/hardcodedTags.js + los textos de la wiki,
 * src/lib/posts/wiki/*.md) a objetos `etiqueta` en la base. Mismo patrón que el importador de
 * amigues (src/lib/server/amigues/importer.js):
 *
 * - Escribe SOLO con saveObject(); la tabla de apoyo `tag_sources` (migración 0029) va en la
 *   misma tanda (opción `also`).
 * - **Idempotente**: cada etiqueta queda unida a su entrada del archivo por `source_key`.
 *   - si la entrada no cambió (mismo SHA-256 de lo importado), no hace nada;
 *   - si cambió y la etiqueta no se tocó desde la última importación, la actualiza;
 *   - si se editó en el panel (su `version` ya no es la de la importación), no la pisa;
 *   - si se borró en el panel, no la revive;
 *   - si ya había una etiqueta viva con ese nombre creada en el panel, la deja como está (y la usa
 *     para las relaciones de las demás).
 * - En dos pasos, porque una relación necesita que exista la otra punta: primero crea las que
 *   faltan (solo con su nombre), después les carga datos y relaciones.
 * - `budget`: cuántas escrituras hace como mucho en una corrida (el panel corre por tandas para no
 *   pasarse del límite de consultas de un Worker; vuelve a correr y sigue donde quedó).
 *
 * Corre en el Worker (Panel → Etiquetas → Importar), en `scripts/import-tags.js` (base local) y
 * en las pruebas. Solo imports relativos.
 */
import { ObjectError } from '../objects/errors.js';
import { saveObject, slugify } from '../objects/save.js';
import { TAG_TYPE } from '../objects/types/etiqueta.js';
import { sha256 } from '../amigues/importer.js';
import { recordFingerprint, tagsToRecords } from './model.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./model.js').TagRecord} TagRecord */

/** Quién figura como autore de lo que escribe el script de Node. */
export const SCRIPT_ACTOR = 'importacion-etiquetas';

/** Hash de una etiqueta recién creada (solo con su nombre): el segundo paso siempre la completa. */
const PLACEHOLDER_HASH = '0'.repeat(64);

/**
 * @typedef {'created' | 'updated' | 'unchanged' | 'skipped_edited' | 'skipped_deleted' | 'skipped_panel' | 'pending' | 'error'} TagImportAction
 */

/**
 * @typedef {{ key: string, action: TagImportAction, id: number | null, alias: boolean, message?: string, warnings: string[] }} TagImportResult
 */

/**
 * Las etiquetas que ya hay en la base y sus fuentes.
 *
 * @param {D1Database} db
 */
async function loadState(db) {
	const { results: objs } = await db
		.prepare(
			`SELECT id, slug, version, deleted_at, json_extract(data, '$.key') AS key
			FROM objects WHERE type = ?1 ORDER BY id`
		)
		.bind(TAG_TYPE)
		.all();
	const { results: srcs } = await db
		.prepare('SELECT tag_id, source_key, source_hash, imported_version FROM tag_sources')
		.all();
	/** @type {Map<number, { id: number, slug: string, version: number, deleted: boolean, key: string }>} */
	const byId = new Map();
	/** @type {Map<string, number>} key → id de la viva */
	const liveByKey = new Map();
	/** @type {Set<string>} */
	const slugs = new Set();
	for (const o of objs) {
		const row = {
			id: Number(o.id),
			slug: String(o.slug),
			version: Number(o.version),
			deleted: o.deleted_at != null,
			key: String(o.key ?? '')
		};
		byId.set(row.id, row);
		slugs.add(row.slug);
		if (!row.deleted) liveByKey.set(row.key, row.id);
	}
	/** @type {Map<string, { tagId: number, hash: string, importedVersion: number }>} */
	const sources = new Map();
	for (const s of srcs) {
		sources.set(String(s.source_key), {
			tagId: Number(s.tag_id),
			hash: String(s.source_hash),
			importedVersion: Number(s.imported_version)
		});
	}
	return { byId, liveByKey, slugs, sources };
}

/**
 * Una dirección interna libre para una etiqueta («español» y «espanol» darían la misma).
 *
 * @param {string} key
 * @param {Set<string>} taken
 */
export function freeTagSlug(key, taken) {
	const base = slugify(key) || 'etiqueta';
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		const slug = `${base.slice(0, 90)}-${n}`;
		if (!taken.has(slug)) return slug;
	}
}

/** @param {unknown} error */
function describeError(error) {
	if (error instanceof ObjectError) {
		const details = error.errors.map((e) => e.message).join(' ');
		return details ? `${error.message} ${details}` : error.message;
	}
	return String(error instanceof Error ? error.message : error);
}

/**
 * Importa (o actualiza) las etiquetas. Nunca tira por una etiqueta: cada una informa su resultado.
 *
 * @param {D1Database} db
 * @param {{ rawTags: readonly Record<string, unknown>[], wikiFiles?: readonly { name: string, raw: string }[] }} source
 * @param {{ actor: string, now?: number, dryRun?: boolean, budget?: number }} opts
 * @returns {Promise<{ results: TagImportResult[], warnings: string[], pending: number }>}
 */
export async function importTags(
	db,
	{ rawTags, wikiFiles = [] },
	{ actor, now = Date.now(), dryRun = false, budget = Infinity }
) {
	const { records, warnings } = tagsToRecords(rawTags, wikiFiles);
	const state = await loadState(db);
	let writes = 0;
	/** @type {Map<string, TagImportResult>} */
	const results = new Map();
	/** @param {TagRecord} r @param {TagImportAction} action @param {Partial<TagImportResult>} [extra] */
	const report = (r, action, extra = {}) =>
		results.set(r.key, {
			key: r.key,
			action,
			id: null,
			alias: Boolean(r.aliasOf),
			warnings: [],
			...extra
		});

	// Paso 1: crear las que faltan, solo con su nombre.
	/** @type {Set<string>} */
	const createdNow = new Set();
	for (const r of records) {
		if (state.sources.has(r.key)) continue;
		const panelId = state.liveByKey.get(r.key);
		if (panelId !== undefined) {
			report(r, 'skipped_panel', { id: panelId });
			continue;
		}
		if (dryRun) {
			report(r, 'created');
			createdNow.add(r.key);
			continue;
		}
		if (writes >= budget) {
			report(r, 'pending');
			continue;
		}
		const slug = freeTagSlug(r.key, state.slugs);
		try {
			writes++;
			const saved = await saveObject(
				db,
				{ type: TAG_TYPE, title: r.key, slug, data: { key: r.key } },
				{
					actor,
					now,
					also: (self) => [
						db
							.prepare(
								`INSERT INTO tag_sources (tag_id, source_key, source_hash, imported_version,
									imported_at, updated_at)
								SELECT id, ?3, ?4, 1, ?5, ?5 FROM objects WHERE type = ?1 AND slug = ?2`
							)
							.bind(self.type, self.slug, r.key, PLACEHOLDER_HASH, now)
					]
				}
			);
			state.slugs.add(saved.slug);
			state.liveByKey.set(r.key, saved.id);
			state.byId.set(saved.id, {
				id: saved.id,
				slug: saved.slug,
				version: saved.version,
				deleted: false,
				key: r.key
			});
			state.sources.set(r.key, { tagId: saved.id, hash: PLACEHOLDER_HASH, importedVersion: 1 });
			createdNow.add(r.key);
		} catch (error) {
			report(r, 'error', { message: describeError(error) });
		}
	}

	// Paso 2: datos y relaciones.
	const pendingKeys = new Set(
		[...results.values()].filter((x) => x.action === 'pending').map((x) => x.key)
	);
	for (const r of records) {
		if (results.has(r.key)) continue;
		const src = state.sources.get(r.key);
		const created = createdNow.has(r.key);
		if (!src) {
			if (dryRun && created) continue; // ya informada
			report(r, 'pending');
			continue;
		}
		const obj = state.byId.get(src.tagId);
		const hash = await sha256(recordFingerprint(r));
		const base = { id: src.tagId };
		if (!obj) {
			report(r, 'error', { ...base, message: 'la etiqueta de la importación ya no existe' });
			continue;
		}
		if (obj.deleted) {
			report(r, 'skipped_deleted', base);
			continue;
		}
		if (src.hash === hash) {
			report(r, 'unchanged', base);
			continue;
		}
		if (obj.version !== src.importedVersion) {
			report(r, 'skipped_edited', base);
			continue;
		}
		const action = created || src.hash === PLACEHOLDER_HASH ? 'created' : 'updated';
		if (dryRun) {
			report(r, action, base);
			continue;
		}
		if (writes >= budget) {
			report(r, 'pending', base);
			continue;
		}
		/** @type {string[]} */
		const lost = [];
		/** @param {string} key */
		const idOf = (key) => {
			const id = state.liveByKey.get(key);
			if (id === undefined) lost.push(key);
			return id;
		};
		/** @type {Record<string, import('../objects/edges.js').EdgeInput[]>} */
		const edges = {
			hijo_de: r.parents.flatMap((p) => {
				const to = idOf(p.key);
				return to === undefined ? [] : [{ to, data: { orden: p.orden } }];
			}),
			relacionada_con: r.related.flatMap((k) => {
				const to = idOf(k);
				return to === undefined ? [] : [to];
			}),
			alias_de: r.aliasOf
				? (() => {
						const to = idOf(/** @type {string} */ (r.aliasOf));
						return to === undefined ? [] : [to];
					})()
				: []
		};
		// Una punta que todavía no se creó (quedó para la próxima tanda): esta también espera, para
		// no guardarla sin esa relación.
		if (lost.some((k) => pendingKeys.has(k))) {
			report(r, 'pending', base);
			continue;
		}
		try {
			writes++;
			const saved = await saveObject(
				db,
				{
					id: obj.id,
					type: TAG_TYPE,
					version: obj.version,
					title: r.title,
					data: { key: r.key, ...r.data },
					edges
				},
				{
					actor,
					now,
					also: () => [
						db
							.prepare(
								`UPDATE tag_sources SET source_hash = ?2, imported_version = ?3, updated_at = ?4
								WHERE tag_id = ?1`
							)
							.bind(obj.id, hash, obj.version + 1, now)
					]
				}
			);
			obj.version = saved.version;
			report(r, action, {
				...base,
				warnings: lost.map((k) => `«${k}» no está en la base (borrada o falta): sin esa relación`)
			});
		} catch (error) {
			report(r, 'error', { ...base, message: describeError(error) });
		}
	}

	const list = records.map((r) => /** @type {TagImportResult} */ (results.get(r.key)));
	return { results: list, warnings, pending: list.filter((r) => r.action === 'pending').length };
}

/**
 * Resumen de una corrida, para el panel y el script.
 *
 * @param {TagImportResult[]} results
 */
export function summarizeTagImport(results) {
	/** @type {Record<TagImportAction, number>} */
	const counts = {
		created: 0,
		updated: 0,
		unchanged: 0,
		skipped_edited: 0,
		skipped_deleted: 0,
		skipped_panel: 0,
		pending: 0,
		error: 0
	};
	for (const r of results) counts[r.action]++;
	return counts;
}

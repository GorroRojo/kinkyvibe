/**
 * Lo que Etiquetas muestra en su «Para revisar» (sin declarar, fuera del árbol y referencias
 * rotas), contado en el servidor con las mismas entradas que la página (`analyzeTags` sobre las
 * etiquetas de la base, el uso en las publicaciones y la wiki). Lo usa la fila de etiquetas de
 * «Para revisar» del panel (tarjeta del Inicio y contador del menú, docs/panel.md). «Sin usar» no
 * cuenta: no es un problema, solo un dato.
 */
import { contentMetas, tagUsage } from '$lib/server/admin/content.js';
import { rowsOf } from '$lib/server/db/batch.js';
import { USAGE_CATEGORIES, analyzeTags } from '$lib/utils/tagConfig.js';
import { recordsToRawTags } from './model.js';
import { readTagRecords, tagRecordsStatements } from './read.js';

/** @typedef {import('./editor.js').StoredTag} StoredTag */

/**
 * Cuánto se usa cada etiqueta (en las publicaciones de la base) y qué etiquetas tienen entrada en
 * la wiki: lo que la página de Etiquetas le pasa a `analyzeTags`.
 * @returns {Promise<{ usage: Record<string, Record<string, number>>, wikiPosts: Record<string, string> }>}
 */
export async function tagUsageAndWiki() {
	/** @type {Record<string, Record<string, number>>} */
	const usage = {};
	// Una sola lectura de todas las publicaciones (los eventos y el material, de la base).
	const metas = await contentMetas();
	for (const c of USAGE_CATEGORIES) usage[c] = await tagUsage(c, metas);
	/** @type {Record<string, string>} */
	const wikiPosts = {};
	for (const p of metas) {
		if (p.category === 'wiki' && p.meta?.wiki) wikiPosts[String(p.meta.wiki)] = p.slug;
	}
	return { usage, wikiPosts };
}

/**
 * @typedef {{ undeclared: number, orphans: number, broken: number }} TagIssueCounts
 */

/**
 * Las pestañas de «Para revisar» de Etiquetas que cuentan como problema. Pura: la misma cuenta que
 * ve la página (`view.undeclared`, `view.orphans`, `view.broken`).
 *
 * @param {import('$lib/utils/tagConfig.js').TagEntry[]} entries
 * @param {Record<string, Record<string, number>>} usage
 * @param {Record<string, string>} [wikiPosts]
 * @returns {TagIssueCounts}
 */
export function tagIssueCounts(entries, usage, wikiPosts = {}) {
	const view = analyzeTags(entries, usage, wikiPosts);
	return {
		undeclared: view.undeclared.length,
		orphans: view.orphans.length,
		broken: view.broken.length
	};
}

/**
 * Las etiquetas de la base como las lee Etiquetas (`dbTagsForAdmin`: todas, también las ocultas),
 * para una tanda (`runQueries`). `null` sin etiquetas o si falla (sin la migración 0029).
 *
 * @param {string} login quién mira (une admin)
 * @returns {import('$lib/server/db/batch.js').BatchQuery<StoredTag[] | null>}
 */
export function tagRecordsQuery(login) {
	return {
		what: 'para revisar: etiquetas',
		fallback: null,
		statements: (db) => tagRecordsStatements(db, { role: 'admin', id: login }),
		read: (results) => {
			const records = readTagRecords(rowsOf(results, 0), rowsOf(results, 1));
			return records.length ? records : null;
		}
	};
}

/**
 * {@link tagIssueCounts} de las etiquetas de la base. `null` sin etiquetas o sin el uso (la fila
 * no aparece).
 *
 * @param {StoredTag[] | null} records lo de {@link tagRecordsQuery}
 * @param {Awaited<ReturnType<typeof tagUsageAndWiki>> | null} used lo de {@link tagUsageAndWiki}
 * @returns {TagIssueCounts | null}
 */
export function tagIssuesOf(records, used) {
	if (!records || !used) return null;
	return tagIssueCounts(recordsToRawTags(records), used.usage, used.wikiPosts);
}

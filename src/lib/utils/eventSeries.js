/**
 * Series de eventos según el árbol de etiquetas (src/lib/utils/hardcodedTags.js): una serie es
 * una etiqueta hija o nieta de «evento recurrente» (Picantearla, Cine para Sucixs…). Puro, sin
 * Svelte: lo usan los gráficos de Estadísticas para contar quién vuelve a la misma serie.
 */
import { hardcodedTags } from './hardcodedTags.js';

export const RECURRING_ROOT = 'evento recurrente';

/** @param {string} s */
const norm = (s) => s.trim().toLowerCase();

/**
 * Índice de las etiquetas de serie: nombre (o alias) en minúsculas → id de la etiqueta.
 * Hijas y nietas de `root`; los alias (`aka`, y las entradas con `aliasOf`) apuntan al id.
 * @param {ReadonlyArray<{ id: string, children?: string[], aka?: string[], aliasOf?: string }>} [rawTags]
 * @param {string} [root]
 * @returns {Map<string, string>}
 */
export function seriesTagIndex(rawTags = hardcodedTags, root = RECURRING_ROOT) {
	const byId = new Map(rawTags.map((t) => [t.id, t]));
	const children = (/** @type {string} */ id) => byId.get(id)?.children ?? [];
	const ids = new Set();
	for (const child of children(root)) {
		ids.add(child);
		for (const grandchild of children(child)) ids.add(grandchild);
	}
	/** @type {Map<string, string>} */
	const index = new Map();
	for (const id of ids) {
		index.set(norm(id), id);
		for (const alias of byId.get(id)?.aka ?? []) index.set(norm(alias), id);
	}
	for (const t of rawTags) {
		if (t.aliasOf && ids.has(t.aliasOf)) index.set(norm(t.id), t.aliasOf);
	}
	return index;
}

/**
 * Las series de un evento a partir de sus etiquetas (sin repetir, en orden alfabético).
 * @param {unknown} tags las etiquetas del frontmatter
 * @param {Map<string, string>} [index] de `seriesTagIndex`
 * @returns {string[]}
 */
export function eventSeriesTags(tags, index = seriesTagIndex()) {
	if (!Array.isArray(tags)) return [];
	const found = new Set();
	for (const t of tags) {
		if (typeof t !== 'string') continue;
		const id = index.get(norm(t));
		if (id) found.add(id);
	}
	return [...found].sort((a, b) => a.localeCompare(b));
}

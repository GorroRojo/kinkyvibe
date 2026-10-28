/**
 * Qué chips van en la barra de filtros de las listas (TagBar, adentro de PostList): las etiquetas
 * elegidas primero (siempre a la vista, para sacarlas con un toque) y después las más usadas en
 * lo que se ve, hasta 8. Ver docs/estilo.md, «Barra de filtros de las listas».
 */
import { canonicalTag, tagCoverage } from './postSearch.js';

/** Cuántos chips muestra la barra (sin contar las elegidas, que siempre están). */
export const BAR_CHIPS = 8;

/**
 * Cuántas veces aparece cada etiqueta en la lista, una vez por publicación. Como `getVisibleTags`
 * de PostList, se saltean las que tienen todas las publicaciones (no cambiarían el resultado),
 * salvo las ya elegidas. Con `tm`, también cuentan sus hijas, como filtra `filterPosts`: una
 * etiqueta que no está en todas, pero sí ella o una hija, tampoco cambiaría nada.
 * @param {{ meta: { tags?: string[] } }[]} posts
 * @param {string[]} [selected]
 * @param {TagManager} [tm]
 * @returns {Map<string, number>}
 */
export function tagCounts(posts, selected = [], tm = undefined) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const post of posts) {
		for (const tag of new Set(post.meta.tags ?? [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	const coverage = tm ? tagCoverage(posts, tm) : null;
	for (const [tag, n] of counts) {
		const kept = coverage?.get(canonicalTag(/** @type {TagManager} */ (tm), tag)) ?? n;
		if (kept >= posts.length && posts.length > 1 && !selected.includes(tag)) counts.delete(tag);
	}
	return counts;
}

/**
 * Los chips de la barra: primero las elegidas, después las más usadas en lo que se ve, hasta
 * `max`. Empates: orden alfabético. Nunca esconde una elegida.
 * @param {{ meta: { tags?: string[] } }[]} posts lo que se ve ahora (ya filtrado)
 * @param {string[]} selected
 * @param {number} [max]
 * @param {TagManager} [tm] el árbol (ver `tagCounts`)
 * @returns {string[]}
 */
export function barChips(posts, selected, max = BAR_CHIPS, tm = undefined) {
	const counts = tagCounts(posts, selected, tm);
	const rest = [...counts.entries()]
		.filter(([tag]) => !selected.includes(tag))
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
		.map(([tag]) => tag);
	return [...selected, ...rest].slice(0, Math.max(max, selected.length));
}

/**
 * Suma o saca una etiqueta de las elegidas (la que se suma va al final, como en el árbol).
 * @param {string[]} selected
 * @param {string} tag
 * @param {boolean} on
 * @returns {string[]}
 */
export function toggleTag(selected, tag, on) {
	const rest = selected.filter((t) => t !== tag);
	return on ? [...rest, tag] : rest;
}

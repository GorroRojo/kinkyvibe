/**
 * Qué chips van en la barra de filtros de las listas (TagBar, adentro de PostList): las etiquetas
 * elegidas primero (siempre a la vista, para sacarlas con un toque) y después las más usadas en
 * lo que se ve, hasta 8. Ver docs/estilo.md, «Barra de filtros de las listas».
 */

/** Cuántos chips muestra la barra (sin contar las elegidas, que siempre están). */
export const BAR_CHIPS = 8;

/**
 * Cuántas veces aparece cada etiqueta en la lista, una vez por publicación. Como `getVisibleTags`
 * de PostList, se saltean las que tienen todas las publicaciones (no cambiarían el resultado),
 * salvo las ya elegidas.
 * @param {{ meta: { tags?: string[] } }[]} posts
 * @param {string[]} [selected]
 * @returns {Map<string, number>}
 */
export function tagCounts(posts, selected = []) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const post of posts) {
		for (const tag of new Set(post.meta.tags ?? [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	for (const [tag, n] of counts) {
		if (n >= posts.length && posts.length > 1 && !selected.includes(tag)) counts.delete(tag);
	}
	return counts;
}

/**
 * Los chips de la barra: primero las elegidas, después las más usadas en lo que se ve, hasta
 * `max`. Empates: orden alfabético. Nunca esconde una elegida.
 * @param {{ meta: { tags?: string[] } }[]} posts lo que se ve ahora (ya filtrado)
 * @param {string[]} selected
 * @param {number} [max]
 * @returns {string[]}
 */
export function barChips(posts, selected, max = BAR_CHIPS) {
	const counts = tagCounts(posts, selected);
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

/**
 * Cuentas puras del prototipo «Filtros en el celu» (/estilo/prototipos/filtros-celu): qué chips
 * van en la barra y qué etiquetas muestra la hoja «Más filtros» con su buscador. Sin Svelte, para
 * poder probarlas (filtros.test.js). Solo las usa el prototipo, que existe en previews y en dev.
 */
import { normalizeText } from '$lib/utils/postSearch.js';

/**
 * Cuántas veces aparece cada etiqueta en la lista. Como `getVisibleTags` de PostList, se saltean
 * las que tienen todas las publicaciones (no cambiarían el resultado), salvo las ya elegidas.
 * @param {{ meta: { tags: string[] } }[]} posts
 * @param {string[]} [selected]
 * @returns {Map<string, number>}
 */
export function tagCounts(posts, selected = []) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const post of posts) {
		for (const tag of new Set(post.meta.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	for (const [tag, n] of counts) {
		if (n >= posts.length && posts.length > 1 && !selected.includes(tag)) counts.delete(tag);
	}
	return counts;
}

/**
 * Los chips de la barra: primero las etiquetas elegidas (siempre a la vista, para poder sacarlas
 * con un toque), después las más usadas en lo que se ve, hasta `max`. Empates: orden alfabético.
 * @param {{ meta: { tags: string[] } }[]} posts lo que se ve ahora (ya filtrado)
 * @param {string[]} selected
 * @param {number} [max]
 * @returns {string[]}
 */
export function barChips(posts, selected, max = 8) {
	const counts = tagCounts(posts, selected);
	const rest = [...counts.entries()]
		.filter(([tag]) => !selected.includes(tag))
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
		.map(([tag]) => tag);
	return [...selected, ...rest].slice(0, Math.max(max, selected.length));
}

/**
 * Las etiquetas de la hoja «Más filtros», agrupadas por su madre y filtradas por el buscador
 * (sin tildes ni mayúsculas, por id o por nombre visible). Los grupos sin coincidencias no salen.
 * @param {string[]} tags
 * @param {string} query
 * @param {(tag: string) => { group: string, name?: string }} info grupo y nombre de cada etiqueta
 * @returns {{ group: string, tags: string[] }[]}
 */
export function sheetGroups(tags, query, info) {
	const q = normalizeText(query);
	/** @type {Map<string, string[]>} */
	const groups = new Map();
	for (const tag of tags) {
		const { group, name } = info(tag);
		if (q && !normalizeText(tag).includes(q) && !normalizeText(name ?? '').includes(q)) continue;
		const list = groups.get(group) ?? [];
		list.push(tag);
		groups.set(group, list);
	}
	return [...groups.entries()].map(([group, list]) => ({
		group,
		tags: list.sort((a, b) => a.localeCompare(b, 'es'))
	}));
}

/**
 * Las etiquetas que muestra el árbol (versión 2: el árbol de hoy, en la hoja o en su columna).
 * Igual que `getVisibleTags` de PostList, pero sin tocar stores: las que aparecen en lo que se ve,
 * salvo las que tienen todas las publicaciones (no cambiarían nada), a menos que estén elegidas o
 * que alguna de sus madres esté elegida.
 * @param {{ meta: { tags: string[] } }[]} posts lo que se ve ahora (ya filtrado)
 * @param {string[]} selected
 * @param {(tag: string) => string[]} parentsOf las madres de cada etiqueta en el árbol
 * @returns {string[]}
 */
export function visibleTagsFor(posts, selected, parentsOf) {
	/** @type {Map<string, number>} */
	const counts = new Map();
	for (const post of posts) {
		for (const tag of post.meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}
	return [...counts.entries()]
		.filter(
			([tag, n]) =>
				n < posts.length ||
				selected.includes(tag) ||
				selected.some((s) => parentsOf(tag).includes(s))
		)
		.map(([tag]) => tag);
}

/**
 * La Kinkipedia (/wiki): el índice de secciones (las ramas de arriba del árbol que tienen algo que
 * mostrar) y las opciones del buscador «Ir a una entrada», que usa la misma búsqueda que el
 * selector de etiquetas del sitio (`searchTagOptions`, $lib/utils/adminTags.js). Funciones puras,
 * con pruebas en wikiIndex.test.js.
 */
import { searchTagOptions } from './adminTags.js';
import { tagPagePath } from './series.js';

/**
 * ¿La entrada se muestra en el árbol de la Kinkipedia? La misma regla que GlosarioItem.svelte:
 * tiene descripción, relacionadas o alias, o alguna de sus hijas (o nietas…) los tiene.
 *
 * @param {TagManager} tm
 * @param {string} id
 * @param {Set<string>} [seen] para no dar vueltas si el árbol tiene un ciclo
 * @returns {boolean}
 */
export function wikiVisible(tm, id, seen = new Set()) {
	if (seen.has(id)) return false;
	seen.add(id);
	const t = tm.get(id);
	if (!t) return false;
	if ((t.description && t.description !== '') || t.related?.length || t.aka?.length) return true;
	return (t.children ?? []).some((/** @type {string} */ c) => wikiVisible(tm, c, seen));
}

/**
 * Las secciones de arriba del árbol (hijas de `root`) que se ven, con su ancla en la página (el
 * `id` del `<dt>` de GlosarioItem: el nombre visible o el id).
 *
 * @param {TagManager} tm
 * @returns {{ id: string, name: string, icon: string, anchor: string }[]}
 */
export function wikiSections(tm) {
	const root = tm.get('root');
	return (root?.children ?? [])
		.filter((/** @type {string} */ id) => wikiVisible(tm, id))
		.map((/** @type {string} */ id) => {
			const t = tm.get(id);
			const name = t?.visible_name ?? id;
			return {
				id,
				name,
				icon: String(t?.icon ?? '').trim(),
				anchor: `#${encodeURIComponent(name)}`
			};
		});
}

/**
 * Todas las entradas para «Ir a una entrada»: cada etiqueta del árbol (sin `root` ni los alias),
 * con sus otros nombres para encontrarla igual, y dónde vive (su madre).
 *
 * @param {TagManager} tm
 * @returns {import('./adminTags.js').TagOption[]}
 */
export function wikiOptions(tm) {
	/** @type {Map<string, string[]>} */
	const aliases = new Map();
	/** @param {string} id @param {string} alias */
	const addAlias = (id, alias) => {
		if (!alias || alias === id) return;
		aliases.set(id, [...new Set([...(aliases.get(id) ?? []), alias])]);
	};
	for (const [id, t] of tm.entries()) {
		if (t?.aliasOf) addAlias(t.aliasOf, id);
		for (const a of t?.aka ?? []) addAlias(id, a);
		if (t?.visible_name && t.visible_name !== id) addAlias(id, id);
	}
	/** @type {import('./adminTags.js').TagOption[]} */
	const out = [];
	for (const [id, t] of tm.entries()) {
		if (!id || id === 'root' || t?.aliasOf || t?.orphan) continue;
		const parent = (t?.parents ?? []).find((/** @type {string} */ p) => p !== 'root');
		out.push({
			id,
			name: t?.visible_name ?? id,
			icon: String(t?.icon ?? '').trim(),
			color: t?.getColor?.(),
			group: parent ? (tm.get(parent)?.visible_name ?? parent) : '',
			aliases: aliases.get(id) ?? [],
			count: 0,
			inTree: true
		});
	}
	return out;
}

/**
 * Lo que sugiere «Ir a una entrada» para lo que se escribió (nada con el campo vacío), en la forma
 * de las sugerencias de ChipCombobox. `value` es la dirección de la entrada (/wiki/<etiqueta>).
 *
 * @param {import('./adminTags.js').TagOption[]} options de {@link wikiOptions}
 * @param {string} query
 * @param {TagManager} tm
 * @param {number} [limit]
 */
export function wikiSuggestions(options, query, tm, limit = 8) {
	if (!query.trim()) return [];
	return searchTagOptions(options, query, { limit, tm }).map((o) => ({
		value: tagPagePath(o.id),
		label: o.name,
		icon: o.icon || '#',
		color: o.color,
		detail: [o.group, o.matched ? `también «${o.matched}»` : ''].filter(Boolean).join(' · ')
	}));
}

/** Minúsculas y sin tildes, para comparar lo escrito con los textos del árbol. */
const normalize = (/** @type {string} */ s) =>
	s
		.toLowerCase()
		.replaceAll('á', 'a')
		.replaceAll('é', 'e')
		.replaceAll('í', 'i')
		.replaceAll('ó', 'o')
		.replaceAll('ú', 'u');

/**
 * El filtro de texto del buscador de la Kinkipedia: deja las etiquetas cuyo id, nombre,
 * descripción, alias o relacionadas contienen `q` (sin mayúsculas ni tildes), y las madres de esas
 * para que el árbol siga armado. MODIFICA `tm`: pasale uno nuevo (`freshSiteTags()`).
 *
 * @param {TagManager} tm
 * @param {string} q
 * @returns {TagManager}
 */
export function filterWikiTree(tm, q) {
	const needle = normalize(q);
	const has = (/** @type {string | undefined} */ s) =>
		s !== undefined && normalize(s).includes(needle);
	/** @type {string[]} */
	const drop = [];
	/** @type {Set<string>} */
	const keep = new Set();
	tm.tagsData().forEach((/** @type {ProcessedTag} */ t) => {
		if (
			has(t.id) ||
			has(t.visible_name) ||
			has(t.description) ||
			has(t.aka?.join(' ')) ||
			has(t.related?.join(' '))
		) {
			t.getAllParents().forEach((/** @type {string} */ p) => keep.add(p));
		} else {
			drop.push(t.id);
		}
	});
	drop.forEach((id) => (keep.has(id) ? null : tm.delete(id)));
	return tm;
}

/**
 * Etiquetas en direcciones: la forma "slug" de una etiqueta (espacios → guiones, como en
 * /wiki/Cine-para-Sucixs) y el camino de vuelta, de un segmento de URL a la etiqueta.
 *
 * Todo lo que recibe una etiqueta por la URL (/wiki/<término>, /api/series/<etiqueta>,
 * /ics/etiqueta/<etiqueta>.ics) la resuelve con `resolveTagSlug`, y todo lo que arma un link a
 * una etiqueta usa `tagSlug`. Así una etiqueta de varias palabras («Rancheadita Kinky») se
 * encuentra igual con «Rancheadita-Kinky», «Rancheadita Kinky» o «rancheadita-kinky», y los
 * alias (`aka`) llevan a la etiqueta de la que son alias.
 *
 * Funciones puras: andan en el navegador, en el servidor y en vitest.
 */

/**
 * La forma de una etiqueta en las direcciones: espacios → guiones. (Sin codificar: quien arma el
 * link usa encodeURIComponent.)
 *
 * @param {string} id
 */
export function tagSlug(id) {
	return String(id).replaceAll(' ', '-');
}

/** @param {string} s */
const fold = (s) => tagSlug(s).toLocaleLowerCase('es');

/**
 * El id cuya forma slug, sin mayúsculas, coincide con `key`. Si dos etiquetas solo difieren en
 * mayúsculas, gana la primera declarada.
 *
 * @param {TagManager} tagManager
 * @param {string} key
 */
function findFolded(tagManager, key) {
	return tagManager.tagIDs().find((id) => fold(id) === key);
}

/**
 * La etiqueta (ya resuelta si es un alias) que nombra un segmento de URL, o `undefined` si no
 * existe en el árbol. Prueba, en orden: tal cual (etiquetas con guiones propios, como
 * «Risk-Aware…»), con los guiones como espacios, y por último comparando las formas slug sin
 * mayúsculas.
 *
 * @param {TagManager} tagManager
 * @param {string | undefined | null} segment ya decodificado (como `params` de SvelteKit)
 * @returns {ProcessedTag | undefined}
 */
export function resolveTagSlug(tagManager, segment) {
	const raw = String(segment ?? '').trim();
	if (!raw) return undefined;
	/** @param {string | undefined} id */
	const known = (id) => {
		if (!id) return undefined; // (el árbol tiene una etiqueta con id vacío)
		const t = tagManager.get(id);
		return t && !t.orphan ? t : undefined;
	};
	return known(raw) ?? known(raw.replaceAll('-', ' ')) ?? known(findFolded(tagManager, fold(raw)));
}

/**
 * El id canónico de la etiqueta que nombra un segmento de URL, o `null` si no existe.
 *
 * @param {TagManager} tagManager
 * @param {string | undefined | null} segment
 */
export function tagIdFromSlug(tagManager, segment) {
	return resolveTagSlug(tagManager, segment)?.id ?? null;
}

/**
 * Cuántas etiquetas muestra una tarjeta de las listas (PostListItem y Card): hasta 5 y un «+N»
 * que despliega el resto adentro de la tarjeta (decisión de gorrite, opción 1b de docs/seo.md).
 * Las que no se ven no van en el HTML (es lo que alivia `/material` y la wiki), pero siguen en
 * los datos de la publicación: la búsqueda y los filtros por etiqueta leen `post.meta.tags`
 * (postSearch.js), nunca lo que muestra la tarjeta.
 */
export const CARD_TAGS_MAX = 5;

/**
 * Las etiquetas que se ven y cuántas quedan detrás del «+N».
 * @param {string[] | null | undefined} tags las que la tarjeta mostraría enteras (ya sin KinkyVibe
 *   y demás); si todavía no están, ninguna
 * @param {boolean} [expanded] si la persona tocó «+N»
 * @param {number} [max]
 * @returns {{ shown: string[], extra: number }} `extra`: las que van detrás del «+N» (0 si
 *   entran todas); desplegada, `shown` son todas y `extra` sigue diciendo cuántas eran
 */
export function cardTags(tags, expanded = false, max = CARD_TAGS_MAX) {
	tags = tags ?? [];
	const extra = Math.max(0, tags.length - max);
	return { shown: expanded || extra == 0 ? tags : tags.slice(0, max), extra };
}

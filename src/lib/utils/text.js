/**
 * Text helpers shared by the browser, the server and the Worker's cron. No imports on purpose:
 * src/lib/server/objects (which the nightly cron loads without Vite) can use them without
 * pulling YAML or anything else in.
 */

/**
 * Las marcas que se sacan para comparar: las tildes y diéresis sueltas que deja `normalize('NFD')`
 * (U+0300–U+036F) y los signos diacríticos de Unicode, que incluyen los que van sueltos como
 * ´ ^ ¨ ` y el punto volado · («Mel·la»). La receta amplia (gorrite, Mesa
 * `chica-567-quitar-tildes`): la que ya usaban el buscador del panel, la puerta y las órdenes.
 */
const FOLD_MARKS = /[\p{Diacritic}\u0300-\u036f]/gu;

/**
 * Sin tildes ni signos diacríticos, sin tocar mayúsculas ni espacios: "Mel·la Ñandú" → "Mella
 * Nandu". Para comparar y buscar, nunca para mostrar ni para armar direcciones ({@link slugify}
 * tiene su propia receta, así los slugs que ya existen no cambian).
 * @param {unknown} s
 */
export function stripMarks(s) {
	return String(s ?? '')
		.normalize('NFD')
		.replace(FOLD_MARKS, '');
}

/**
 * Lowercase, without accents or diacritic signs, trimmed, single spaces: "  Córdoba   Capital " →
 * "cordoba capital", "Mel·la" → "mella". The one recipe for comparing and searching text (panel
 * search, door, orders, the bot, imports...), never for showing.
 * @param {unknown} s
 */
export function foldText(s) {
	return stripMarks(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * "¡Córdoba! Taller de Ecofetichismo" → "cordoba-taller-de-ecofetichismo" (at most 80 characters,
 * never ending in a dash). Keeps its own narrow accent recipe on purpose (only U+0300–U+036F, not
 * {@link foldText}'s): "Mel·la" stays "mel-la", so slugs and URLs that already exist don't change.
 * @param {unknown} text
 */
export function slugify(text) {
	return String(text ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80)
		.replace(/-+$/, '');
}

/**
 * Escapes every regular-expression metacharacter, so `text` matches literally inside a
 * `new RegExp(...)` (also `/`, harmless and handy in literals): "a.b/c" → "a\\.b\\/c".
 * @param {string} text
 */
export function escapeRegExp(text) {
	return String(text).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * Lecturas cortas de valores que vienen de datos guardados (JSON de un objeto, frontmatter): el
 * texto recortado o nada.
 */

/**
 * El texto recortado, o `null` si no es texto o está vacío.
 *
 * @param {unknown} v
 * @returns {string | null}
 */
export function textOrNull(v) {
	return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Cualquier valor como texto recortado ('' si falta).
 *
 * @param {unknown} v
 */
export function asText(v) {
	return typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
}

/**
 * Una lista de textos (o un texto suelto) como lista de textos no vacíos.
 *
 * @param {unknown} v
 * @returns {string[]}
 */
export function asTextList(v) {
	return Array.isArray(v) ? v.map(asText).filter(Boolean) : asText(v) ? [asText(v)] : [];
}

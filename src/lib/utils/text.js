/**
 * Lecturas cortas de valores que vienen de datos guardados (JSON de un objeto, frontmatter): el
 * texto recortado o nada. Puras, sin dependencias (las usan también los scripts de Node).
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

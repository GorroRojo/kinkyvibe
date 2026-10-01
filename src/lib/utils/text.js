/**
 * Text helpers shared by the browser, the server and the Worker's cron. No imports on purpose:
 * src/lib/server/objects (which the nightly cron loads without Vite) can use them without
 * pulling YAML or anything else in.
 */

/**
 * Lowercase, without accents, trimmed, single spaces: "  Córdoba   Capital " → "cordoba capital".
 * For comparing and searching, never for showing.
 * @param {unknown} s
 */
export function foldText(s) {
	return String(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * "¡Córdoba! Taller de Ecofetichismo" → "cordoba-taller-de-ecofetichismo" (at most 80 characters,
 * never ending in a dash).
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

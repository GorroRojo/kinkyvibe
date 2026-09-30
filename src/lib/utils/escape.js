/** @type {Record<string, string>} */
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escapes text for HTML element content and quoted attribute values.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

/**
 * JSON that is safe inside an inline `<script>` element: `<`, `>` and `&` are written as
 * `<`-style escapes, which JSON parsers read back as the same characters, so the text can
 * never close the script element. U+2028/U+2029 are escaped too for older JS parsers.
 * @param {unknown} value
 * @param {number} [space]
 * @returns {string}
 */
export function jsonForScript(value, space) {
	return (JSON.stringify(value, null, space) ?? 'null').replace(
		/[<>&\u2028\u2029]/g,
		(c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
	);
}

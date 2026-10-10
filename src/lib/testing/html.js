/**
 * Ayudas para leer el HTML que devuelve `render` en los tests. Sin expresiones regulares sobre
 * etiquetas ni comentarios: CodeQL las marca como «sanitización incompleta» (aunque sea un test),
 * así que se corta con `split`.
 */

/** El HTML sin los comentarios `<!--…-->` (los marcadores de Svelte). @param {string} html */
export function withoutComments(html) {
	return html
		.split('<!--')
		.map((part, i) => {
			if (i === 0) return part;
			const end = part.indexOf('-->');
			return end === -1 ? '' : part.slice(end + 3);
		})
		.join('');
}

/** El texto visible: sin etiquetas ni comentarios. @param {string} html */
export function textOf(html) {
	return withoutComments(html)
		.split('<')
		.map((part, i) => {
			if (i === 0) return part;
			const end = part.indexOf('>');
			return end === -1 ? '' : part.slice(end + 1);
		})
		.join('');
}

/**
 * La etiqueta de apertura del último `Notice` (`class="kv-notice …"`) que empieza antes de `text`,
 * o '' si `text` no está o no hay ninguno antes. Sirve para ver el tono y el `role` del aviso que
 * dice algo (la prueba igual mira que el texto esté).
 * @param {string} html @param {string} text
 */
export function noticeBefore(html, text) {
	const at = html.indexOf(text);
	if (at === -1) return '';
	const cls = html.lastIndexOf('class="kv-notice ', at);
	if (cls === -1) return '';
	return html.slice(html.lastIndexOf('<', cls), html.indexOf('>', cls) + 1);
}

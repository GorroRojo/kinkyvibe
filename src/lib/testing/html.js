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

/** Las entidades que escribe Svelte en los atributos, de vuelta a su carácter. @param {string} s */
const decodeAttr = (s) =>
	s
		.split('&quot;')
		.join('"')
		.split('&#39;')
		.join("'")
		.split('&lt;')
		.join('<')
		.split('&gt;')
		.join('>')
		.split('&amp;')
		.join('&');

/** @param {string | undefined} c */
const isSeparator = (c) => c === ' ' || c === '\n' || c === '\t' || c === '/';

/**
 * Los atributos de una etiqueta de apertura (lo que va entre el nombre y el `>`), leídos de a un
 * carácter: `name="valor"`, `name='valor'` o `name` solo (valor '').
 * @param {string} src
 * @returns {Record<string, string>}
 */
function readAttributes(src) {
	/** @type {Record<string, string>} */
	const out = {};
	let i = 0;
	while (i < src.length) {
		while (i < src.length && isSeparator(src[i])) i++;
		let name = '';
		while (i < src.length && !isSeparator(src[i]) && src[i] !== '=') name += src[i++];
		if (!name) break;
		if (src[i] !== '=') {
			out[name] = '';
			continue;
		}
		i++;
		const quote = src[i] === '"' || src[i] === "'" ? src[i++] : '';
		let value = '';
		while (i < src.length && (quote ? src[i] !== quote : !isSeparator(src[i]))) value += src[i++];
		if (quote) i++;
		out[name] = decodeAttr(value);
	}
	return out;
}

/**
 * Los atributos de cada etiqueta `<tag …>` del HTML, en orden (sin mirar adentro de los
 * comentarios). Para leer las `<meta>` y los `<link>` del `<head>` en los tests.
 * @param {string} html
 * @param {string} tag
 * @returns {Record<string, string>[]}
 */
export function tagsOf(html, tag) {
	return withoutComments(html)
		.split(`<${tag}`)
		.slice(1)
		.filter((part) => part === '' || isSeparator(part[0]) || part[0] === '>')
		.map((part) => {
			const end = part.indexOf('>');
			return readAttributes(end === -1 ? part : part.slice(0, end));
		});
}

/**
 * Las `<meta>` del HTML por clave (`property` u `name`): cada clave con todos sus `content`, en
 * orden (así una clave repetida se ve).
 * @param {string} html
 * @returns {Record<string, string[]>}
 */
export function metaTags(html) {
	/** @type {Record<string, string[]>} */
	const out = {};
	for (const attrs of tagsOf(html, 'meta')) {
		const key = attrs.property ?? attrs.name;
		if (key) (out[key] ??= []).push(attrs.content ?? '');
	}
	return out;
}

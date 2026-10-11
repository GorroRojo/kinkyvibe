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
 * Los atributos de una etiqueta de apertura, leídos de a un carácter desde `start` (justo después
 * del nombre) hasta el `>` que la cierra, que no cuenta si está entre comillas (Svelte no escapa
 * `>` ni `<` adentro de un atributo): `name="valor"`, `name='valor'` o `name` solo (valor '').
 * @param {string} src
 * @param {number} start
 * @returns {{ attrs: Record<string, string>, end: number }} `end`: dónde sigue el HTML
 */
function readAttributes(src, start) {
	/** @type {Record<string, string>} */
	const attrs = {};
	let i = start;
	while (i < src.length) {
		while (i < src.length && isSeparator(src[i])) i++;
		if (i >= src.length || src[i] === '>') return { attrs, end: i + 1 };
		let name = '';
		while (i < src.length && !isSeparator(src[i]) && src[i] !== '=' && src[i] !== '>') {
			name += src[i++];
		}
		if (src[i] !== '=') {
			attrs[name] = '';
			continue;
		}
		i++;
		const quote = src[i] === '"' || src[i] === "'" ? src[i++] : '';
		let value = '';
		while (i < src.length && (quote ? src[i] !== quote : !isSeparator(src[i]) && src[i] !== '>')) {
			value += src[i++];
		}
		if (quote) i++;
		attrs[name] = decodeAttr(value);
	}
	return { attrs, end: src.length };
}

/**
 * Los atributos de cada etiqueta `<tag …>` del HTML, en orden (sin mirar adentro de los
 * comentarios ni de los atributos de otras etiquetas). Para leer las `<meta>` y los `<link>` del
 * `<head>` en los tests.
 * @param {string} html
 * @param {string} tag
 * @returns {Record<string, string>[]}
 */
export function tagsOf(html, tag) {
	const src = withoutComments(html);
	/** @type {Record<string, string>[]} */
	const out = [];
	let i = 0;
	while (i < src.length) {
		const lt = src.indexOf('<', i);
		if (lt === -1) break;
		// el nombre de la etiqueta que empieza acá
		let j = lt + 1;
		let name = '';
		while (j < src.length && !isSeparator(src[j]) && src[j] !== '>') name += src[j++];
		if (name.startsWith('/') || name === '') {
			i = lt + 1;
			continue;
		}
		const { attrs, end } = readAttributes(src, j);
		if (name === tag) out.push(attrs);
		i = end;
	}
	return out;
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

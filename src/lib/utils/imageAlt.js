/**
 * Las imágenes que muestra un texto guardado (el cuerpo de un perfil, con el markdown y el HTML
 * corto que usan las fichas) y su texto alternativo: para «Fotos sin descripción» en «Para
 * revisar» del panel (docs/panel.md) y para escribirle la descripción a una sin tocar nada más del
 * texto.
 *
 * Reconoce las dos formas que usan los textos:
 * - HTML: `<img alt="" src={foto6} />`, `<img src="/media/img/…" alt="…">` (con o sin `alt`);
 * - markdown: `![qué se ve](/media/img/…)`.
 * Lo que está dentro de un comentario HTML (`<!-- … -->`) o de un bloque de código (``` … ```) no
 * se muestra, así que no cuenta.
 *
 * Nunca inventa una descripción: solo dice cuáles no tienen y escribe la que manda une admin.
 *
 * Funciones puras, sin dependencias: corren en el navegador, en el servidor y en vitest.
 */

/** Largo máximo de una descripción (como un `alt` razonable; más largo va en el texto). */
export const ALT_MAX = 300;

/**
 * @typedef {{
 *   index: number,
 *   kind: 'html' | 'md',
 *   start: number,
 *   end: number,
 *   src: string,
 *   alt: string,
 *   hasAlt: boolean
 * }} TextImage
 *   `index`: el lugar de la imagen en el texto (0 = la primera); `start`/`end`: dónde está la
 *   etiqueta (o el `![…](…)`) en el texto; `src`: lo que dice el texto (una dirección o `{foto}`);
 *   `hasAlt`: si la etiqueta HTML tiene el atributo `alt` (en markdown, siempre).
 */

const HTML_IMG = /<img\b[^>]*>/gi;
const MD_IMG = /!\[((?:\\.|[^\]\\])*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;

/** Un atributo de una etiqueta: `name="…"`, `name='…'`, `name={…}` o `name=valor`. */
const attrRe = (/** @type {string} */ name) =>
	new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|(\\{[^}]*\\})|([^\\s"'>/]+))`, 'i');

/**
 * Los tramos del texto que no se muestran: comentarios HTML y bloques de código.
 * @param {string} text
 * @returns {[number, number][]}
 */
function hiddenRanges(text) {
	/** @type {[number, number][]} */
	const out = [];
	for (const m of text.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) {
		const at = m.index ?? 0;
		out.push([at, at + m[0].length]);
	}
	for (const m of text.matchAll(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm)) {
		const at = m.index ?? 0;
		out.push([at, at + m[0].length]);
	}
	return out;
}

/** @param {string} s */
const decodeEntities = (s) =>
	s
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');

/**
 * El valor de un atributo de una etiqueta `<img …>`, o `null` si no lo tiene.
 * @param {string} tag
 * @param {string} name
 */
function attrOf(tag, name) {
	const m = attrRe(name).exec(tag);
	if (!m) return null;
	return { value: m[2] ?? m[3] ?? m[4] ?? m[5] ?? '', at: m.index, length: m[0].length };
}

/**
 * Las imágenes del texto, en orden.
 * @param {unknown} body
 * @returns {TextImage[]}
 */
export function textImages(body) {
	const text = typeof body === 'string' ? body : '';
	if (!text) return [];
	const hidden = hiddenRanges(text);
	/** @param {number} at */
	const isHidden = (at) => hidden.some(([a, b]) => at >= a && at < b);
	/** @type {Omit<TextImage, 'index'>[]} */
	const found = [];
	for (const m of text.matchAll(HTML_IMG)) {
		const at = m.index ?? 0;
		if (isHidden(at)) continue;
		const tag = m[0];
		const alt = attrOf(tag, 'alt');
		const src = attrOf(tag, 'src');
		found.push({
			kind: 'html',
			start: at,
			end: at + tag.length,
			src: src ? src.value.trim() : '',
			alt: alt ? decodeEntities(alt.value).trim() : '',
			hasAlt: Boolean(alt)
		});
	}
	for (const m of text.matchAll(MD_IMG)) {
		const at = m.index ?? 0;
		if (isHidden(at)) continue;
		found.push({
			kind: 'md',
			start: at,
			end: at + m[0].length,
			src: m[2].trim(),
			alt: m[1].replace(/\\(.)/g, '$1').trim(),
			hasAlt: true
		});
	}
	return found.sort((a, b) => a.start - b.start).map((x, index) => ({ index, ...x }));
}

/**
 * Las imágenes del texto que no tienen descripción (sin `alt` o con uno vacío).
 * @param {unknown} body
 */
export function imagesWithoutAlt(body) {
	return textImages(body).filter((i) => !i.alt);
}

/**
 * Una descripción lista para guardar: en una línea, sin espacios de más y con el largo máximo.
 * `''` si no queda nada.
 * @param {unknown} alt
 */
export function cleanAlt(alt) {
	return String(alt ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, ALT_MAX)
		.trim();
}

/** @param {string} s */
const escapeAttr = (s) =>
	s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** @param {string} s */
const escapeMdAlt = (s) => s.replace(/([[\]\\])/g, '\\$1');

/**
 * El texto con la descripción de la imagen número `index` escrita (el resto, igual). `null` si esa
 * imagen ya no está o cambió (otra `src`), o si la descripción está vacía: así no se pisa un texto
 * que alguien editó mientras tanto.
 *
 * @param {string} body
 * @param {number} index
 * @param {string} alt
 * @param {{ src?: string }} [expect] la `src` que tenía la imagen al mostrarla
 * @returns {string | null}
 */
export function setImageAlt(body, index, alt, { src } = {}) {
	const text = cleanAlt(alt);
	if (!text || typeof body !== 'string') return null;
	const image = textImages(body).find((i) => i.index === index);
	if (!image || (src !== undefined && image.src !== src)) return null;
	const piece = body.slice(image.start, image.end);
	let next;
	if (image.kind === 'md') {
		next = piece.replace(/^!\[(?:\\.|[^\]\\])*\]/, `![${escapeMdAlt(text)}]`);
	} else {
		const current = attrOf(piece, 'alt');
		const attr = ` alt="${escapeAttr(text)}"`;
		next = current
			? piece.slice(0, current.at) + attr + piece.slice(current.at + current.length)
			: piece.replace(/^<img\b/i, (open) => open + attr);
	}
	return body.slice(0, image.start) + next + body.slice(image.end);
}

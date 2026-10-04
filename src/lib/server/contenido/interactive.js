/**
 * Los interactivos registrados en el texto de una publicación de la base (decisión 0004, ver
 * $lib/utils/interactivos.js): cómo se arma lo que muestra la página.
 *
 * 1. Antes de pasar el texto a HTML, cada etiqueta registrada (`<kv-…></kv-…>`) se cambia por una
 *    marca de texto (letras y números, que ni el markdown, ni las comillas tipográficas, ni la lista
 *    corta de HTML tocan) y toda otra `<kv-…` se escapa: se ve como texto.
 * 2. Después, el HTML se parte en «partes» ({@link Part}): HTML tal cual, un componente
 *    registrado, o un elemento que contiene un componente (por ejemplo el `<div>` de
 *    `<div><kv-…></kv-…></div>`), con sus partes adentro. La página las muestra con
 *    $lib/components/ContentParts.svelte, que solo conoce los componentes del registro.
 */
import { rehype } from 'rehype';
import { markInteractive } from '$lib/utils/interactivos.js';

/**
 * @typedef {{ html: string }
 *   | { component: string }
 *   | { element: string, attrs: Record<string, string>, children: Part[] }} Part
 */

/**
 * @typedef {{ text: string, tags: string[], marker: RegExp }} MarkedBody
 */

/**
 * El texto listo para pasar a HTML: los interactivos como marcas y las demás `<kv-…` escapadas.
 *
 * @param {string} body
 * @returns {MarkedBody}
 */
export function markBody(body) {
	const nonce = crypto.randomUUID().replace(/-/g, '');
	const { text, tags } = markInteractive(body, (_, i) => `kvinteractivo${nonce}n${i}x`);
	return { text, tags, marker: new RegExp(`kvinteractivo${nonce}n(\\d+)x`, 'g') };
}

const processor = rehype().data('settings', { fragment: true });

/** @param {any} node */
const stringify = (node) => processor.stringify({ type: 'root', children: [node] });

/** Atributos que se pueden poner en un elemento que envuelve un interactivo. */
const SAFE_ATTR = /^(?!on)[a-z_:][-a-z0-9_:.]*$/i;

/** @param {string} s */
function decodeEntities(s) {
	return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(quot|amp|lt|gt|apos));/gi, (_, hex, dec, named) => {
		if (hex) return String.fromCodePoint(parseInt(hex, 16));
		if (dec) return String.fromCodePoint(Number(dec));
		return { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" }[
			/** @type {'quot'} */ (String(named).toLowerCase())
		];
	});
}

/**
 * Los atributos de un elemento como texto (los mismos que da el HTML), sin los `on…`.
 * @param {any} el
 */
function attrsOf(el) {
	const open = stringify({ ...el, children: [] }).match(/^<[^\s>]+([^>]*)>/)?.[1] ?? '';
	/** @type {Record<string, string>} */
	const attrs = {};
	const re = /([^\s=/]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
	for (let m = re.exec(open); m; m = re.exec(open)) {
		if (!SAFE_ATTR.test(m[1])) continue;
		attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
	}
	return attrs;
}

/**
 * @param {any} node
 * @param {RegExp} marker
 * @returns {boolean}
 */
function hasMarker(node, marker) {
	if (node.type === 'text') {
		marker.lastIndex = 0;
		return marker.test(node.value);
	}
	return Array.isArray(node.children) && node.children.some((c) => hasMarker(c, marker));
}

/**
 * @param {any[]} nodes
 * @param {MarkedBody} marked
 * @returns {Part[]}
 */
function toParts(nodes, marked) {
	/** @type {Part[]} */
	const parts = [];
	/** @param {string} html */
	const pushHtml = (html) => {
		if (!html) return;
		const last = parts[parts.length - 1];
		if (last && 'html' in last) last.html += html;
		else parts.push({ html });
	};
	for (const node of nodes) {
		if (!hasMarker(node, marked.marker)) {
			pushHtml(stringify(node));
		} else if (node.type === 'text') {
			let last = 0;
			const re = new RegExp(marked.marker.source, 'g');
			for (let m = re.exec(node.value); m; m = re.exec(node.value)) {
				pushHtml(stringify({ type: 'text', value: node.value.slice(last, m.index) }));
				const tag = marked.tags[Number(m[1])];
				if (tag) parts.push({ component: tag });
				last = m.index + m[0].length;
			}
			pushHtml(stringify({ type: 'text', value: node.value.slice(last) }));
		} else if (node.type === 'element') {
			parts.push({
				element: node.tagName,
				attrs: attrsOf(node),
				children: toParts(node.children, marked)
			});
		} else {
			pushHtml(stringify(node));
		}
	}
	return parts;
}

/**
 * Lo que quedó de una marca donde no puede ir un componente (por ejemplo dentro de un atributo)
 * vuelve a ser la etiqueta, escapada.
 *
 * @param {string} html
 * @param {MarkedBody} marked
 */
export function unmark(html, marked) {
	return html.replace(new RegExp(marked.marker.source, 'g'), (_, i) => {
		const tag = marked.tags[Number(i)] ?? 'kv-';
		return `&lt;${tag}&gt;&lt;/${tag}&gt;`;
	});
}

/**
 * El HTML ya armado → sus partes. Sin interactivos, `null` (la página usa el HTML tal cual).
 *
 * @param {string} html
 * @param {MarkedBody} marked
 * @returns {Part[] | null}
 */
export function interactiveParts(html, marked) {
	if (!marked.tags.length) return null;
	const tree = processor.parse(html);
	const parts = toParts(tree.children, marked);
	if (!parts.some(hasComponent)) return null;
	return parts.map((p) => unmarkPart(p, marked));
}

/** @param {Part} p @returns {boolean} */
function hasComponent(p) {
	if ('component' in p) return true;
	return 'children' in p && p.children.some(hasComponent);
}

/**
 * @param {Part} p
 * @param {MarkedBody} marked
 * @returns {Part}
 */
function unmarkPart(p, marked) {
	if ('html' in p) return { html: unmark(p.html, marked) };
	if ('children' in p) return { ...p, children: p.children.map((c) => unmarkPart(c, marked)) };
	return p;
}

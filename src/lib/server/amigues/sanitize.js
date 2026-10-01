/**
 * Limpieza del HTML de los textos de perfiles guardados en la base (el cuerpo de una ficha de
 * amigues), en el servidor, antes de `{@html}`. Una lista corta de etiquetas y atributos
 * (decisión P6.6: "lista corta de HTML para todes"); todo lo demás se saca.
 *
 * - Se sacan con su contenido: script, style, iframe, object, embed, form y parecidos, svg, math.
 * - Etiquetas desconocidas: se saca la etiqueta y queda su contenido.
 * - Atributos: solo los de {@link ALLOWED_ATTRS}; nada de `style`, `on…` ni `srcdoc`.
 * - Links e imágenes: solo http(s), mailto, tel, rutas del sitio y anclas (nada de
 *   `javascript:` ni `data:`). Los links a otros sitios abren en otra pestaña, sin `opener` ni
 *   `referrer` y con `nofollow`.
 * - Los comentarios HTML se sacan.
 * - Un `h1` pasa a `h2` (el `h1` de la página es el nombre del perfil).
 *
 * Es un plugin de unified/rehype ({@link rehypeAllowlist}), en un solo lugar: si más adelante se
 * suma `rehype-sanitize` como dependencia, se reemplaza acá sin tocar nada más.
 */

/** Se sacan con todo su contenido. */
const DROP = new Set([
	'script',
	'style',
	'iframe',
	'object',
	'embed',
	'link',
	'meta',
	'base',
	'form',
	'input',
	'button',
	'textarea',
	'select',
	'option',
	'svg',
	'math',
	'template',
	'noscript',
	'frame',
	'frameset',
	'applet',
	'video',
	'audio',
	'source',
	'track',
	'canvas',
	'dialog',
	'portal'
]);

/** Etiquetas permitidas y sus atributos (nombres de propiedad de hast). */
const ALLOWED_ATTRS = /** @type {Record<string, readonly string[]>} */ ({
	a: ['href', 'title'],
	abbr: ['title'],
	b: [],
	blockquote: [],
	br: [],
	cite: [],
	code: [],
	dd: [],
	del: [],
	details: [],
	div: [],
	dl: [],
	dt: [],
	em: [],
	figcaption: [],
	figure: [],
	h2: [],
	h3: [],
	h4: [],
	h5: [],
	h6: [],
	hr: [],
	i: [],
	img: ['src', 'alt', 'title', 'width', 'height'],
	kbd: [],
	li: [],
	mark: [],
	ol: ['start'],
	p: [],
	pre: [],
	q: [],
	s: [],
	small: [],
	span: [],
	strong: [],
	sub: [],
	summary: [],
	sup: [],
	table: [],
	tbody: [],
	td: ['colSpan', 'rowSpan'],
	th: ['colSpan', 'rowSpan'],
	thead: [],
	tr: [],
	u: [],
	ul: []
});

/** Clases que se dejan (las que usan los textos del sitio); el resto se saca. */
const CLASS = /^[a-z][a-z0-9_-]{0,40}$/i;

/** Origen ficticio para entender rutas relativas. */
const BASE = 'https://kinkyvibe.invalid';

/**
 * ¿Es un link o una imagen que se puede dejar? Devuelve el valor limpio o `null`.
 *
 * @param {unknown} value
 * @param {{ image?: boolean }} [opts]
 * @returns {string | null}
 */
export function safeUrl(value, { image = false } = {}) {
	if (typeof value !== 'string') return null;
	// Los navegadores ignoran espacios y controles dentro del esquema ("java\tscript:").
	const trimmed = value.trim();
	if (!trimmed || [...trimmed].some((c) => c.charCodeAt(0) < 0x20)) return null;
	if (trimmed.startsWith('#')) return image ? null : trimmed;
	let url;
	try {
		url = new URL(trimmed, BASE);
	} catch {
		return null;
	}
	if (url.origin === BASE) {
		// Ruta del sitio: tiene que empezar con "/" (o ser relativa sin esquema).
		return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? null : trimmed;
	}
	const allowed = image ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:', 'tel:'];
	return allowed.includes(url.protocol) ? trimmed : null;
}

/**
 * @param {any} node elemento de hast
 */
function cleanElement(node) {
	if (node.tagName === 'h1') node.tagName = 'h2';
	const allowed = ALLOWED_ATTRS[node.tagName] ?? [];
	/** @type {Record<string, unknown>} */
	const props = {};
	const input = node.properties ?? {};
	for (const name of allowed) {
		const value = input[name];
		if (value === undefined || value === null || value === false) continue;
		if (name === 'href') {
			const url = safeUrl(value);
			if (url) props.href = url;
		} else if (name === 'src') {
			const url = safeUrl(value, { image: true });
			if (url) props.src = url;
		} else if (typeof value === 'string' || typeof value === 'number') {
			props[name] = String(value).slice(0, 300);
		}
	}
	const classes = Array.isArray(input.className)
		? input.className.filter((/** @type {unknown} */ c) => typeof c === 'string' && CLASS.test(c))
		: [];
	if (classes.length) props.className = classes.slice(0, 5);
	if (
		node.tagName === 'a' &&
		typeof props.href === 'string' &&
		/^(https?:)?\/\//i.test(props.href)
	) {
		props.target = '_blank';
		props.rel = ['noopener', 'noreferrer', 'nofollow'];
	}
	if (node.tagName === 'img') props.loading = 'lazy';
	node.properties = props;
}

/**
 * Limpia los hijos de un nodo (recursivo). Devuelve la lista nueva de hijos.
 *
 * @param {any[]} children
 * @returns {any[]}
 */
function cleanChildren(children) {
	/** @type {any[]} */
	const out = [];
	for (const child of children ?? []) {
		if (child.type === 'text') out.push(child);
		else if (child.type === 'element') {
			const tag = String(child.tagName).toLowerCase();
			child.tagName = tag;
			if (DROP.has(tag)) continue;
			child.children = cleanChildren(child.children);
			if (tag in ALLOWED_ATTRS || tag === 'h1') {
				cleanElement(child);
				out.push(child);
			} else {
				out.push(...child.children);
			}
		}
		// comentarios, doctype, raw: afuera
	}
	return out;
}

/**
 * Plugin de unified: deja solo la lista corta de HTML.
 *
 * @returns {(tree: any) => void}
 */
export function rehypeAllowlist() {
	return (tree) => {
		tree.children = cleanChildren(tree.children);
	};
}

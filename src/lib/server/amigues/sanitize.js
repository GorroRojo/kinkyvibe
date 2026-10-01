/**
 * Limpieza del HTML de los textos de perfiles guardados en la base (el cuerpo de una ficha de
 * amigues), en el servidor, antes de `{@html}`. Es el ÚNICO lugar que decide qué HTML pasa: si
 * cambia la librería, cambia acá y nada más.
 *
 * La limpieza la hace `rehype-sanitize` (hast-util-sanitize, el mismo esquema que usa GitHub para
 * el markdown), partiendo de su `defaultSchema`, con estos cambios para lo que usan las fichas
 * (decisión P6.6: "lista corta de HTML para todes"):
 * - se suman `<u>` y los links `tel:`; las clases permitidas son solo las que usa el sitio
 *   (`wikilink` y `mention` en links, `p-pronouns` en `<small>`);
 * - se sacan CON su contenido: script, style, template, noscript, iframe, object, svg y math;
 * - todo lo demás que no está en el esquema se saca (las etiquetas desconocidas dejan su texto).
 *   Nada de `style`, `on…`, `srcdoc`, `javascript:` ni `data:`.
 *
 * Después de limpiar, {@link rehypeProfileLinks} ajusta lo que el sitio quiere en todos los textos:
 * los links a otros sitios abren aparte sin `opener`/`referrer` y con `nofollow`, las imágenes cargan
 * de a poco y un `<h1>` pasa a `<h2>` (el `<h1>` de la página es el nombre del perfil).
 */
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const STRIP = ['script', 'style', 'template', 'noscript', 'iframe', 'object', 'svg', 'math'];

/** El esquema de los textos de perfiles. */
export const PROFILE_SCHEMA = Object.freeze({
	...defaultSchema,
	tagNames: [...(defaultSchema.tagNames ?? []), 'u'],
	strip: [...new Set([...(defaultSchema.strip ?? []), ...STRIP])],
	attributes: {
		...defaultSchema.attributes,
		a: [...(defaultSchema.attributes?.a ?? []), ['className', 'wikilink', 'mention']],
		small: [['className', 'p-pronouns']]
	},
	protocols: {
		...defaultSchema.protocols,
		href: [...(defaultSchema.protocols?.href ?? []), 'tel']
	}
});

/** Origen ficticio para entender rutas relativas. */
const BASE = 'https://kinkyvibe.invalid';

/**
 * ¿Es un link o una imagen que se puede dejar? Devuelve el valor limpio o `null`. (El esquema ya
 * decide los protocolos; esto lo usa el sitio para sus propias reglas, como los links externos.)
 *
 * @param {unknown} value
 * @param {{ image?: boolean }} [opts]
 * @returns {string | null}
 */
export function safeUrl(value, { image = false } = {}) {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	// Los navegadores ignoran espacios y controles dentro del esquema ("java\tscript:").
	if (!trimmed || [...trimmed].some((c) => c.charCodeAt(0) < 0x20)) return null;
	if (trimmed.startsWith('#')) return image ? null : trimmed;
	let url;
	try {
		url = new URL(trimmed, BASE);
	} catch {
		return null;
	}
	if (url.origin === BASE) return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? null : trimmed;
	const allowed = image ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:', 'tel:'];
	return allowed.includes(url.protocol) ? trimmed : null;
}

/**
 * @param {any} node
 * @param {(el: any) => void} fn
 */
function eachElement(node, fn) {
	for (const child of node.children ?? []) {
		if (child.type === 'element') {
			fn(child);
			eachElement(child, fn);
		}
	}
}

/**
 * Plugin de unified que va DESPUÉS de limpiar: links externos, imágenes y títulos.
 *
 * @returns {(tree: any) => void}
 */
export function rehypeProfileLinks() {
	return (tree) =>
		eachElement(tree, (el) => {
			const props = (el.properties ??= {});
			if (el.tagName === 'h1') el.tagName = 'h2';
			if (el.tagName === 'a') {
				const href = typeof props.href === 'string' ? props.href : '';
				delete props.target;
				delete props.rel;
				if (/^(https?:)?\/\//i.test(href)) {
					props.target = '_blank';
					props.rel = ['noopener', 'noreferrer', 'nofollow'];
				}
			}
			if (el.tagName === 'img') props.loading = 'lazy';
		});
}

/**
 * Los dos pasos juntos, como preset de unified: `processor.use(rehypeProfileHtml)`.
 * @type {import('unified').Preset}
 */
export const rehypeProfileHtml = {
	plugins: [[rehypeSanitize, PROFILE_SCHEMA], rehypeProfileLinks]
};

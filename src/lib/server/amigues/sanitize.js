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
 *   Nada de `style`, `on…`, `srcdoc`, `javascript:` ni `data:`, ni `accessKey`/`tabIndex`.
 *
 * Después de limpiar, {@link rehypeProfileLinks} ajusta lo que el sitio quiere en todos los textos:
 * los links a otros sitios abren aparte sin `opener`/`referrer` y con `nofollow`, las imágenes cargan
 * de a poco (salvo la primera del texto de un perfil, que se pide primero; y solo de la biblioteca propia, `/media/…`: una imagen de otro sitio pierde su `src`,
 * como las imágenes de perfil) y un `<h1>` pasa a `<h2>` (el `<h1>` de la página es el nombre del
 * perfil).
 */
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { isPublicMediaUrl } from '../../utils/media.js';

const STRIP = ['script', 'style', 'template', 'noscript', 'iframe', 'object', 'svg', 'math'];

/** Atributos globales del esquema de base que los textos no usan. */
const NO_GLOBAL = ['accessKey', 'tabIndex'];

/**
 * Una imagen de la biblioteca propia (docs/imagenes.md): la dirección del sitio (`/media/…`) o,
 * fuera de producción, la misma imagen en el sitio público (`isPublicMediaUrl`, como las imágenes
 * viejas de legacyMedia.js). Nada de otros sitios ni direcciones como `//otro.sitio/…`.
 */
const OWN_MEDIA = /^\/media\/(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9][A-Za-z0-9/_.-]*$/;

/**
 * ¿Es el `src` de una imagen que se puede dejar? Solo imágenes de la biblioteca propia.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isOwnImageSrc(value) {
	if (typeof value !== 'string') return false;
	return OWN_MEDIA.test(value) || isPublicMediaUrl(value);
}

/** El esquema de los textos de perfiles. */
export const PROFILE_SCHEMA = Object.freeze({
	...defaultSchema,
	tagNames: [...(defaultSchema.tagNames ?? []), 'u'],
	strip: [...new Set([...(defaultSchema.strip ?? []), ...STRIP])],
	attributes: {
		...defaultSchema.attributes,
		// Los atributos de todas las etiquetas, sin los que cambian el teclado de la página.
		'*': (defaultSchema.attributes?.['*'] ?? []).filter((a) => !NO_GLOBAL.includes(String(a))),
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
 * Con `firstImageEager` (el texto de un perfil), la primera imagen que queda con `src` no carga de
 * a poco y se pide primero (`fetchpriority="high"`): suele ser lo más grande de la página (su LCP).
 * Las demás siguen cargando de a poco. Sin la opción (eventos, material, wiki), todas de a poco:
 * en un evento lo primero es el afiche.
 *
 * @param {{ firstImageEager?: boolean }} [opts]
 * @returns {(tree: any) => void}
 */
export function rehypeProfileLinks({ firstImageEager = false } = {}) {
	return (tree) => {
		let eagerLeft = firstImageEager;
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
			if (el.tagName === 'img') {
				if (!isOwnImageSrc(props.src)) delete props.src;
				if (eagerLeft && props.src) {
					eagerLeft = false;
					delete props.loading;
					props.fetchPriority = 'high';
				} else {
					props.loading = 'lazy';
				}
			}
		});
	};
}

/**
 * Los dos pasos juntos, como preset de unified: `processor.use(rehypeProfileHtml)`.
 * @type {import('unified').Preset}
 */
export const rehypeProfileHtml = {
	plugins: [[rehypeSanitize, PROFILE_SCHEMA], rehypeProfileLinks]
};

/**
 * Lo mismo para el texto de un perfil: la primera imagen se pide primero (ver
 * {@link rehypeProfileLinks}).
 * @type {import('unified').Preset}
 */
export const rehypeProfilePageHtml = {
	plugins: [
		[rehypeSanitize, PROFILE_SCHEMA],
		[rehypeProfileLinks, { firstImageEager: true }]
	]
};

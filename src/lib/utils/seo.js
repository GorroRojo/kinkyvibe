/**
 * La vista previa de un link al compartirlo (WhatsApp, Telegram, Instagram, X…): las etiquetas
 * Open Graph y las de Twitter que arma `SeoHead.svelte`. Sin dependencias del servidor: corre en
 * el servidor, en el navegador y en vitest. Ver docs/compartir.md.
 */
import { argDateTimeLong } from './dates.js';
import { placeShort, venuePlaceMeta } from './eventPlace.js';

export const SITE_NAME = 'Kinky Vibe';
export const TWITTER_SITE = '@kinkyvibearg';
export const LOCALE = 'es_AR';

/**
 * @typedef {{ width?: number | null, height?: number | null, alt?: string | null }} ImageInfo
 * @typedef {ImageInfo & { url: string }} PreviewImage
 */

/**
 * La imagen cuando la página no tiene una propia: el logo redondo (512 × 512, unos 100 KB, entra
 * en el límite de WhatsApp). Está en `static/`, así que su dirección no cambia entre deploys.
 * @type {Readonly<Required<PreviewImage>>}
 */
export const DEFAULT_IMAGE = Object.freeze({
	url: '/android-chrome-512x512.png',
	width: 512,
	height: 512,
	alt: 'Kinky Vibe, en letras blancas sobre un círculo rosa'
});

/**
 * Hasta cuántos caracteres va la descripción: WhatsApp muestra unas dos líneas y la de un evento
 * empieza con la fecha y el lugar, que tienen que entrar.
 */
export const DESCRIPTION_MAX = 200;

/**
 * La dirección entera (con `https://…`) de `path` en el sitio de `origin`, o '' si no hay o no es
 * una dirección web (`undefined`, `javascript:`…). Una dirección que ya es entera queda igual.
 * @param {unknown} path
 * @param {string | URL} origin
 */
export function absoluteUrl(path, origin) {
	if (typeof path !== 'string' || !path.trim() || path === 'undefined') return '';
	try {
		const url = new URL(path.trim(), origin);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
	} catch {
		return '';
	}
}

/**
 * La dirección canónica de una página: el sitio y el camino, sin `?…` ni `#…`.
 * @param {URL} url
 */
export function canonicalUrl(url) {
	return url.origin + url.pathname;
}

/**
 * El texto en una línea y, si es largo, cortado en la última palabra que entra, con «…».
 * @param {unknown} text
 * @param {number} [max]
 */
export function shortText(text, max = DESCRIPTION_MAX) {
	const flat = String(text ?? '')
		.split(/\s+/)
		.filter(Boolean)
		.join(' ');
	if (flat.length <= max) return flat;
	const cut = flat.slice(0, max - 1);
	const space = cut.lastIndexOf(' ');
	return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s.,;:·-]+$/, '') + '…';
}

/** @param {string} s */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * La descripción de un evento al compartirlo: la fecha y la hora a la argentina (como «Cuándo y
 * dónde»), el lugar en pocas palabras (lo que deja ver su nivel de privacidad, como el carrusel y
 * la imagen para compartir) y el resumen. «Cancelado» adelante si se canceló.
 * «Viernes 2 de octubre de 2026, 15:00 · Galpón · Una jam para practicar…»
 * @param {Record<string, any>} meta la meta que recibe la página (sin el «Dónde» del .md si tiene lugar)
 * @param {import('./venues.js').VenueView | null | undefined} [venue] el lugar ya filtrado por el servidor
 */
export function eventDescription(meta, venue) {
	const when = meta?.start ? capitalize(argDateTimeLong(meta.start)) : '';
	const where = placeShort(venuePlaceMeta(meta ?? {}, venue));
	const head = [meta?.status === 'cancelado' ? 'Cancelado' : '', when, where]
		.filter(Boolean)
		.join(' · ');
	return [head, shortText(meta?.summary, Infinity)].filter(Boolean).join(' · ');
}

/**
 * La descripción de la página de una etiqueta (o una serie) sin entrada de la Kinkipedia.
 * @param {string} name el nombre de la etiqueta como se ve
 */
export function tagDescription(name) {
	return `Material, amigues y eventos de «${name}» en ${SITE_NAME}.`;
}

/**
 * La imagen de la vista previa: la de la página (dirección entera, con sus medidas y su texto
 * alternativo si se conocen) o, sin imagen, {@link DEFAULT_IMAGE}.
 * @param {unknown} src la imagen de la página (`featured`, la del perfil…), relativa o entera
 * @param {string | URL} origin
 * @param {ImageInfo | null | undefined} [info] medidas y texto alternativo (la portada de la biblioteca)
 * @param {string} [fallbackAlt] el texto alternativo si `info` no trae uno
 * @returns {PreviewImage}
 */
export function previewImage(src, origin, info, fallbackAlt = '') {
	const url = absoluteUrl(src, origin);
	if (!url) return { ...DEFAULT_IMAGE, url: absoluteUrl(DEFAULT_IMAGE.url, origin) };
	const width = Number.isSafeInteger(info?.width) ? info?.width : null;
	const height = Number.isSafeInteger(info?.height) ? info?.height : null;
	return {
		url,
		width: width && height ? width : null,
		height: width && height ? height : null,
		alt: (info?.alt || fallbackAlt || '').trim()
	};
}

/**
 * @typedef {object} SeoInput
 * @property {string} title el título (sin « · Kinky Vibe»)
 * @property {unknown} [description]
 * @property {string} url la dirección canónica, entera
 * @property {PreviewImage} image
 * @property {'website' | 'article' | 'event' | 'profile'} [type]
 * @property {boolean} [noindex] no listado: que los buscadores no lo guarden
 */

/**
 * Las etiquetas `<meta>` de la vista previa, en orden: `[atributo, clave, contenido]` (atributo
 * `property` para Open Graph, `name` para las demás). Sin las que no tienen valor.
 * @param {SeoInput} input
 * @returns {Array<['name' | 'property', string, string]>}
 */
export function seoTags({ title, description, url, image, type = 'website', noindex = false }) {
	const desc = shortText(description);
	const alt = image.alt ?? '';
	/** @type {Array<['name' | 'property', string, unknown]>} */
	const tags = [
		['name', 'robots', noindex ? 'noindex' : ''],
		['name', 'description', desc],
		['property', 'og:site_name', SITE_NAME],
		['property', 'og:locale', LOCALE],
		['property', 'og:type', type],
		['property', 'og:url', url],
		['property', 'og:title', title],
		['property', 'og:description', desc],
		['property', 'og:image', image.url],
		['property', 'og:image:width', image.width ? String(image.width) : ''],
		['property', 'og:image:height', image.height ? String(image.height) : ''],
		['property', 'og:image:alt', alt],
		['name', 'twitter:card', 'summary_large_image'],
		['name', 'twitter:site', TWITTER_SITE],
		['name', 'twitter:title', title],
		['name', 'twitter:description', desc],
		['name', 'twitter:image', image.url],
		['name', 'twitter:image:alt', alt]
	];
	return /** @type {Array<['name' | 'property', string, string]>} */ (
		tags.filter(([, , content]) => typeof content === 'string' && content !== '')
	);
}

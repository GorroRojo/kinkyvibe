/**
 * La vista previa de un link al compartirlo (WhatsApp, Telegram, Instagram, X…): las etiquetas
 * Open Graph y las de Twitter que arma `SeoHead.svelte`. Sin dependencias del servidor: corre en
 * el servidor, en el navegador y en vitest. Ver docs/compartir.md.
 */
import { argDateTimeLong, argDayMonth } from './dates.js';
import { placeShort, venuePlaceMeta } from './eventPlace.js';
import { isMediaPath } from './media.js';
import { OG_CARDS, OG_CARD_SIZE, ogCardAlt } from './ogCards.js';

export const SITE_NAME = 'Kinky Vibe';
export const TWITTER_SITE = '@kinkyvibearg';
export const LOCALE = 'es_AR';

/**
 * @typedef {{ width?: number | null, height?: number | null, alt?: string | null, size?: number | null }} ImageInfo
 *   `size`: el peso en bytes (la portada de la biblioteca lo sabe)
 * @typedef {{ url: string, width?: number | null, height?: number | null, alt?: string | null }} PreviewImage
 */

/**
 * La imagen cuando la página no tiene una propia: una tarjeta de 1200 × 630 con el logo y la frase
 * del sitio (src/lib/utils/ogCards.js), en `static/`, así su dirección no cambia entre deploys.
 * Se dibuja con `node scripts/og-default/render.js` (docs/compartir.md).
 * @type {Readonly<Required<PreviewImage>>}
 */
export const DEFAULT_IMAGE = cardImage('default');

/**
 * La tarjeta de una sección (o la por defecto), con sus medidas y su texto alternativo. La
 * dirección es relativa: {@link previewImage} la vuelve entera.
 * @param {keyof typeof OG_CARDS} key
 * @returns {Readonly<Required<PreviewImage>>}
 */
export function cardImage(key) {
	return Object.freeze({ url: '/' + OG_CARDS[key].file, ...OG_CARD_SIZE, alt: ogCardAlt(key) });
}

/**
 * El sitio de producción: su zona de Cloudflare tiene las transformaciones de imágenes
 * (`/cdn-cgi/image/…`). Los previews de `workers.dev` y el desarrollo local no.
 */
export const PRODUCTION_HOST = 'kinkyvibe.ar';

/**
 * Cómo se achica una portada grande para la vista previa: JPEG (lo lee cualquier app) de 800 px de
 * ancho como mucho (sin agrandar; `fit` por defecto, `scale-down`). Con 1200 px no alcanza: las
 * portadas miden 1000–1280 px y en JPEG pesan más que el WEBP original. `onerror=redirect`: si
 * Cloudflare no puede (por ejemplo, pasado el cupo del mes), manda a la imagen original.
 */
export const PREVIEW_RESIZE = Object.freeze({
	width: 800,
	options: 'width=800,format=jpeg,quality=80,onerror=redirect'
});

/** Hasta este peso la portada va tal cual (WhatsApp muestra hasta unos 300 KB). */
export const SMALL_IMAGE_BYTES = 200 * 1024;

/**
 * La dirección achicada de una imagen para la vista previa, o `null` si va tal cual: solo una
 * imagen de la biblioteca servida desde {@link PRODUCTION_HOST} (así un preview, que se sirve desde
 * otro sitio, nunca la pide), y no si ya se sabe que es liviana.
 * @param {string} url la imagen, entera
 * @param {number | null | undefined} [size] su peso en bytes, si se sabe
 */
export function resizedImageUrl(url, size) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== 'https:' || parsed.hostname !== PRODUCTION_HOST) return null;
	if (!isMediaPath(parsed.pathname) || parsed.search) return null;
	if (Number.isFinite(size) && Number(size) <= SMALL_IMAGE_BYTES) return null;
	return `${parsed.origin}/cdn-cgi/image/${PREVIEW_RESIZE.options}${parsed.pathname}`;
}

/**
 * Las medidas de la imagen achicada: hasta {@link PREVIEW_RESIZE}.width de ancho, con la misma
 * proporción. Si el alto no da un número entero (Cloudflare redondea a su manera) o no se saben
 * las medidas, ninguna: mejor sin medidas que con medidas equivocadas.
 * @param {number | null} width
 * @param {number | null} height
 * @returns {{ width: number | null, height: number | null }}
 */
export function resizedSize(width, height) {
	if (!width || !height) return { width: null, height: null };
	if (width <= PREVIEW_RESIZE.width) return { width, height };
	const h = (height * PREVIEW_RESIZE.width) / width;
	return Number.isInteger(h)
		? { width: PREVIEW_RESIZE.width, height: h }
		: { width: null, height: null };
}

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
 * alternativo si se conocen; en producción, achicada si es grande: {@link resizedImageUrl}) o,
 * sin imagen, {@link DEFAULT_IMAGE}.
 * @param {unknown} src la imagen de la página (`featured`, la del perfil…), relativa o entera
 * @param {string | URL} origin
 * @param {ImageInfo | null | undefined} [info] medidas y texto alternativo (la portada de la biblioteca)
 * @param {string} [fallbackAlt] el texto alternativo si `info` no trae uno
 * @returns {PreviewImage}
 */
export function previewImage(src, origin, info, fallbackAlt = '') {
	const url = absoluteUrl(src, origin);
	if (!url) return { ...DEFAULT_IMAGE, url: absoluteUrl(DEFAULT_IMAGE.url, origin) };
	const known = Number.isSafeInteger(info?.width) && Number.isSafeInteger(info?.height);
	const width = known ? Number(info?.width) : null;
	const height = known ? Number(info?.height) : null;
	const alt = (info?.alt || fallbackAlt || '').trim();
	const resized = resizedImageUrl(url, info?.size);
	if (resized) return { url: resized, ...resizedSize(width, height), alt };
	return { url, width, height, alt };
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

/** «a», «a y b», «a, b y c». @param {string[]} items */
export function joinList(items) {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * Los formatos de material (etiquetas hijas de «formato de material»), en el orden en que se
 * nombran. El tipo «descargable» se suma aparte («Guía descargable»).
 */
export const MATERIAL_FORMATS = Object.freeze([
	'guía',
	'artículo',
	'libro',
	'fanzine',
	'checklist',
	'video'
]);

/**
 * La descripción de un material: qué es (por sus etiquetas de formato y «descargable») y su
 * resumen. «Guía descargable · Un resumen…»
 * @param {{ tags?: string[], summary?: unknown }} meta
 * @param {{ get(id: string): { id: string, visible_name?: string } }} [tagManager] para el nombre
 *   que se ve de cada formato (sin árbol, el id)
 */
export function materialDescription(meta, tagManager) {
	const tags = meta?.tags ?? [];
	const format = MATERIAL_FORMATS.find((f) => tags.includes(f));
	const name = format ? (tagManager?.get(format)?.visible_name ?? format) : '';
	const download = tags.includes('descargable');
	const kind = name
		? capitalize(name) + (download ? ' descargable' : '')
		: download
			? 'Descargable'
			: '';
	return [kind, shortText(meta?.summary, Infinity)].filter(Boolean).join(' · ');
}

/**
 * La descripción del calendario: los próximos eventos (hasta 3, por fecha, con el día a la
 * argentina) adelante, así entran aunque WhatsApp corte, y después `base` (lo que es la página).
 * Sin próximos, `base` sola. Los cancelados no cuentan.
 * «Próximos: Juntada (3/10), Taller (5/10) y Jam (12/10). Talleres, encuentros…»
 * @param {Array<{ meta: Record<string, any> }>} posts
 * @param {string} base
 * @param {number} [now]
 */
export function upcomingDescription(posts, base, now = Date.now()) {
	const next = posts
		.filter((p) => p.meta?.title && p.meta?.status !== 'cancelado')
		.map((p) => ({ title: String(p.meta.title), at: new Date(p.meta.start).getTime() }))
		.filter((p) => Number.isFinite(p.at) && p.at >= now)
		.sort((a, b) => a.at - b.at)
		.slice(0, 3)
		.map((p) => `${p.title} (${argDayMonth(p.at)})`);
	return next.length ? `Próximos: ${joinList(next)}. ${base}` : base;
}

/**
 * Las listas que se pueden filtrar por la dirección (`?tags=a,b&q=texto`, y `?tipo=` en
 * Amigues): `title`, el nombre corto (el de las listas filtradas: «Amigues · terapia»);
 * `heading`, el título de la vista previa sin filtros, que dice qué es la página; `description`,
 * qué hay (sin filtros, y también después del filtro: «Amigues con la etiqueta terapia. …»), con
 * el texto de presentación de cada página; e `items`, cómo se llama lo que lista.
 */
export const LIST_SECTIONS = Object.freeze({
	calendario: {
		title: 'Calendario',
		heading: 'Calendario · Próximos talleres, encuentros y eventos cuir, kinky y BDSM',
		description:
			'Talleres, encuentros y eventos cuir, kinky y BDSM de Kinky Vibe y la comunidad, con fecha, lugar y entradas.',
		items: 'Eventos'
	},
	material: {
		title: 'Material',
		heading: 'Material · Guías, artículos, libros y descargables sobre BDSM y kink',
		description:
			'Guías, artículos, libros, fanzines y descargables sobre BDSM y kink, en español e inglés: material inicial para quienes empiezan y por práctica, como cuerdas, impacto o electro.',
		items: 'Material'
	},
	amigues: {
		title: 'Amigues',
		heading: 'Amigues · Emprendimientos y profesionales de la comunidad',
		description:
			'Profesionales, proyectos y lugares cuir y kinky de la comunidad de Kinky Vibe: sesiones BDSM, clases, terapia, arte, tiendas y más.',
		items: 'Amigues'
	},
	todo: {
		title: 'Todo el contenido',
		heading: 'Todo el contenido · Eventos, material y amigues',
		description:
			'Todo Kinky Vibe en un mismo lugar: eventos, material y amigues. Filtrá por un tema, como shibari, y encontrá libros, talleres y les profesionales que dan clases.',
		items: 'Contenido'
	}
});

/** La Kinkipedia (sin filtros por la dirección): título y descripción de su vista previa. */
export const KINKIPEDIA_PREVIEW = Object.freeze({
	title: 'Kinkipedia · Glosario cuir, kinky y BDSM',
	description:
		'Glosario cuir, kinky y BDSM de Kinky Vibe: qué es cada práctica, rol, implemento y término, con su material, eventos y amigues, y las series de encuentros que se repiten.'
});

/** Cuántas etiquetas se nombran como mucho (una dirección puede traer cualquier cosa). */
const MAX_FILTER_TAGS = 5;

/**
 * @typedef {object} ListFilters
 * @property {Array<{ id: string, name: string }>} tags las etiquetas (alias resueltos, sin repetir)
 * @property {string} text la búsqueda (`?q=`), en una línea
 * @property {string | null} kind `?tipo=` si es uno de los que la lista conoce
 * @property {string | null} kindLabel cómo se llama ese tipo («Personas»)
 */

/**
 * Los filtros de una lista según su dirección: `?tags=` (separadas por coma; cada alias, su
 * etiqueta; una desconocida, tal cual), `?q=` y, si la lista los tiene, `?tipo=`.
 * @param {URL} url
 * @param {{ get(id: string): { id: string, visible_name?: string } }} tagManager
 * @param {{ kinds?: Readonly<Record<string, string>> }} [opts] los tipos de la lista (`KIND_FILTERS`)
 * @returns {ListFilters}
 */
export function listFilters(url, tagManager, { kinds } = {}) {
	/** @type {Map<string, string>} */
	const tags = new Map();
	for (const raw of (url.searchParams.get('tags') ?? '').split(',')) {
		const slug = raw.trim();
		if (!slug || tags.size >= MAX_FILTER_TAGS) continue;
		const tag = tagManager.get(slug);
		const id = tag?.id ?? slug;
		if (!tags.has(id)) tags.set(id, String(tag?.visible_name ?? id));
	}
	const kind = url.searchParams.get('tipo') ?? '';
	const known = kinds && Object.hasOwn(kinds, kind) ? kind : null;
	return {
		tags: [...tags].map(([id, name]) => ({ id, name })),
		text: shortText(url.searchParams.get('q') ?? '', 60),
		kind: known,
		kindLabel: known && kinds ? kinds[known] : null
	};
}

/** ¿La lista está filtrada? @param {ListFilters} f */
export const isFiltered = (f) => f.tags.length > 0 || f.text !== '' || f.kind !== null;

/**
 * La dirección para `og:url` de una lista filtrada: la página con sus filtros normalizados (las
 * etiquetas por su id, sin alias ni repetidas; la búsqueda en una línea) y ordenados por nombre,
 * así el mismo filtro es siempre la misma dirección y la vista previa lo muestra. Sin filtros, la
 * página sola.
 * @param {URL} url
 * @param {ListFilters} filters
 */
export function filteredListUrl(url, filters) {
	/** @type {Array<[string, string]>} */
	const params = [];
	if (filters.text) params.push(['q', filters.text]);
	if (filters.tags.length) params.push(['tags', filters.tags.map((t) => t.id).join(',')]);
	if (filters.kind) params.push(['tipo', filters.kind]);
	params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	const search = new URLSearchParams(params).toString().split('%2C').join(',');
	return url.origin + url.pathname + (search ? `?${search}` : '');
}

/**
 * Título y descripción de una lista: sin filtros, `plain` (por defecto, los de la sección); con
 * filtros, el nombre corto con los filtros y una frase con el filtro antes de la descripción de
 * la sección. «Amigues · terapia» / «Amigues con la etiqueta terapia. Profesionales, proyectos…»
 * @param {keyof typeof LIST_SECTIONS} section
 * @param {ListFilters} filters
 * @param {{ title: string, description: string }} [plain] sin filtros
 */
export function listPreview(section, filters, plain) {
	const { title, heading, description, items } = LIST_SECTIONS[section];
	if (!isFiltered(filters)) return plain ?? { title: heading, description };
	const names = filters.tags.map((t) => t.name);
	const quoted = filters.text ? `«${filters.text}»` : '';
	const tagsPart = !names.length
		? ''
		: names.length === 1
			? ` con la etiqueta ${names[0]}`
			: ` con las etiquetas ${joinList(names)}`;
	return {
		title: [title, filters.kindLabel ?? '', names.join(', '), quoted].filter(Boolean).join(' · '),
		description: `${filters.kindLabel ?? items}${tagsPart}${quoted ? ` que mencionan ${quoted}` : ''}. ${description}`
	};
}

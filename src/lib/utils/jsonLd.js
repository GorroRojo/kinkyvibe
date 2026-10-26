/**
 * Datos estructurados (JSON-LD de schema.org) de las páginas públicas: la organización, los
 * eventos, el material, la Kinkipedia y los perfiles. Funciones puras: reciben lo que la página ya
 * tiene y devuelven el objeto que va en `<LDTag schema={…} />`.
 *
 * Regla: **solo lo que la página ya le muestra a cualquiera**. Lo que el servidor filtró (el lugar
 * según su privacidad, el contacto público de un perfil) llega filtrado; acá no se agrega nada que
 * no esté en la página. Los textos de Open Graph y la vista previa al compartir son de otro lado.
 */
import { eventPlaceSchema } from './eventPlace.js';
import { venuePostalAddress } from './venues.js';
import { KINKYVIBE_TAG } from './propinas.js';
import { contactItems } from './perfiles.js';
import { ORG_CONTACT_EMAIL } from './organization.js';
import { isoDateTime, parseSiteDate } from './dates.js';

import { SITE_URL } from './site.js';

// La dirección del sitio sale de ./site.js (un solo lugar); se reexporta para quien ya la importa de acá.
export { SITE_URL };
export const SITE_NAME = 'Kinky Vibe';
export const SITE_DESCRIPTION =
	'Divulgación disidente, producción de eventos y talleres, gestión comunitaria y editorial. Información y encuentros cuir LGTBQIA+ kinky y de BDSM.';
/** El mismo `@id` que ya usaba la página de inicio. */
export const ORGANIZATION_ID = `${SITE_URL}#organization`;
/** El sitio (`WebSite`): el nombre que Google muestra arriba de cada resultado. */
export const WEBSITE_ID = `${SITE_URL}#website`;
/** Otros nombres con los que se busca el sitio (`WebSite.alternateName`). */
export const SITE_ALTERNATE_NAMES = Object.freeze(['KinkyVibe', 'kinkyvibe.ar']);
/** El idioma de las páginas (el mismo que `<html lang>` en app.html). */
export const SITE_LANGUAGE = 'es-AR';
export const KINKIPEDIA_ID = `${SITE_URL}/wiki#kinkipedia`;

/**
 * Las redes oficiales del sitio (las del pie de página, que las marca con `rel="me"`).
 * @type {readonly string[]}
 */
export const OFFICIAL_PROFILES = Object.freeze([
	'https://t.me/BDSMtextos',
	'https://www.instagram.com/kinkyvibeargentina/',
	'https://twitter.com/kinkyvibearg',
	'https://www.youtube.com/@KinkyVibe',
	'https://www.tiktok.com/@kinkyvibearg'
]);

/**
 * Un objeto de schema.org. `any` a propósito: los tipos de schema-dts (`LD.Schema`, el de
 * LDTag) no aceptan objetos armados de a partes; lo que importa lo prueban los tests.
 * @typedef {any} JsonLd
 */

/**
 * Una dirección absoluta del sitio (o una web de afuera tal cual). Nada para lo vacío, para
 * «undefined» (lo que dejaba `featured + ''`) y para otros esquemas (`javascript:`, `mailto:`…).
 * @param {unknown} href
 * @returns {string | undefined}
 */
export function absoluteUrl(href) {
	if (typeof href !== 'string') return undefined;
	const s = href.trim();
	if (!s || s === 'undefined' || s === 'null') return undefined;
	if (/^https?:\/\//i.test(s)) return s;
	if (s.startsWith('/') && !s.startsWith('//')) return SITE_URL + encodeURI(decodeSafe(s));
	return undefined;
}

/** @param {string} s */
function decodeSafe(s) {
	try {
		return decodeURI(s);
	} catch {
		return s;
	}
}

/**
 * Una fecha en ISO 8601 válido, o nada si no se puede leer. Las fechas con hora y zona del sitio
 * (`2026-10-02T22:00-03:00`) y las de solo día (`2026-10-02`) se dejan tal cual; las de
 * publicación (`2024-12-06Z-03:00`, que no es ISO 8601) pasan a `2024-12-06T00:00:00-03:00`
 * (`isoDateTime` de dates.js). Un `Date` o un número (el fin calculado de un evento, la apertura
 * de la venta) también van en hora de Argentina (`-03:00`), como `startDate`.
 * @param {unknown} d
 * @returns {string | undefined}
 */
export function isoDate(d) {
	if (d instanceof Date || typeof d === 'number')
		return isNaN(new Date(d).getTime()) ? undefined : isoDateTime(d);
	if (typeof d !== 'string' || !d.trim()) return undefined;
	const s = d.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isNaN(new Date(s).getTime()) ? undefined : s;
	return isoDateTime(s);
}

/** Saca las claves sin valor (`undefined`, `null`, `''`, listas vacías). @param {JsonLd} o */
function clean(o) {
	return /** @type {JsonLd} */ (
		Object.fromEntries(
			Object.entries(o).filter(
				([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
			)
		)
	);
}

/**
 * La organización, por referencia (su ficha completa está en la página de inicio).
 * @returns {JsonLd}
 */
export function organizationRef() {
	return { '@type': 'Organization', '@id': ORGANIZATION_ID, name: SITE_NAME, url: SITE_URL };
}

/**
 * La organización entera, para la página de inicio.
 * @returns {JsonLd}
 */
export function organizationSchema() {
	return {
		'@context': 'https://schema.org',
		...organizationRef(),
		description: SITE_DESCRIPTION,
		logo: `${SITE_URL}/android-chrome-512x512.png`,
		email: ORG_CONTACT_EMAIL,
		sameAs: [...OFFICIAL_PROFILES]
	};
}

/**
 * El sitio, para la página de inicio: el nombre con el que Google lo muestra (`name` y
 * `alternateName`). Sin `SearchAction`: Google ya no muestra la caja de búsqueda del sitio.
 * @returns {JsonLd}
 */
export function websiteSchema() {
	return {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		'@id': WEBSITE_ID,
		name: SITE_NAME,
		alternateName: [...SITE_ALTERNATE_NAMES],
		url: SITE_URL,
		description: SITE_DESCRIPTION,
		inLanguage: SITE_LANGUAGE,
		publisher: organizationRef()
	};
}

/**
 * El perfil público de une autore, para enlazarle desde los datos estructurados: su dirección
 * (`/amigues/<perfil>`) y su clase. Lo arma el servidor con {@link authorLinksFrom}, solo con los
 * perfiles listados que ve cualquiera (nunca con lo que ve quien tiene sesión).
 * @typedef {{ name: string, path: string, kind?: string }} AuthorLink
 */

/**
 * Los perfiles públicos de les autores (`authors:`, por nombre con espacios → guiones, como
 * `authorSlugs` en src/lib/server/amigues/asPost.js) que están en `posts`: la lista listada sin
 * sesión (`sitePosts`). Lo que no está (perfil oculto, no listado, sin perfil) queda sin link.
 * @param {unknown} authors
 * @param {readonly { path?: string, meta?: Record<string, any> }[] | null | undefined} posts
 * @param {string} [selfID] el post mismo no es su autore
 * @returns {AuthorLink[]}
 */
export function authorLinksFrom(authors, posts, selfID) {
	if (!Array.isArray(authors) || !Array.isArray(posts)) return [];
	/** @type {Map<string, { path?: string, meta?: Record<string, any> }>} */
	const profiles = new Map();
	for (const p of posts)
		if (p?.meta?.category === 'amigues' && typeof p.meta.postID === 'string')
			profiles.set(p.meta.postID, p);
	/** @type {AuthorLink[]} */
	const out = [];
	for (const a of authors) {
		if (typeof a !== 'string' || !a.trim() || a === KINKYVIBE_TAG) continue;
		const slug = a.replaceAll(' ', '-');
		const profile = slug === selfID ? undefined : profiles.get(slug);
		if (!profile?.path) continue;
		out.push({ name: a, path: profile.path, kind: profile.meta?.kind });
	}
	return out;
}

/**
 * Les autores (`authors:`) por su nombre; KinkyVibe, la organización. Con perfil público
 * (`links`, de {@link authorLinksFrom}), con su `url` y su tipo (persona → Person, proyecto o
 * lugar → Organization); sin perfil, una persona por su nombre.
 * @param {unknown} authors
 * @param {readonly AuthorLink[]} [links]
 * @returns {JsonLd[]}
 */
function authorsOf(authors, links = []) {
	if (!Array.isArray(authors)) return [];
	const byName = new Map(links.map((l) => [l.name, l]));
	return authors
		.filter((a) => typeof a === 'string' && a.trim())
		.map((a) => {
			if (a === KINKYVIBE_TAG) return organizationRef();
			const link = byName.get(a);
			const url = link ? absoluteUrl(link.path) : undefined;
			if (!link || !url) return { '@type': 'Person', name: a };
			const person = link.kind !== 'proyecto' && link.kind !== 'lugar';
			// El `@id` es el de la entidad de su página (profileSchema); un lugar es un `Place`
			// allá, así que acá, como organización, va sin `@id`.
			return clean({
				'@type': person ? 'Person' : 'Organization',
				'@id': link.kind === 'lugar' ? undefined : `${url}#perfil`,
				name: a,
				url
			});
		});
}

/** @param {unknown} tags */
const tagList = (tags) => (Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : []);

/**
 * La oferta de un evento: la venta del sitio (si la hay) o el link de inscripción.
 * @param {{ postID?: string, tags?: unknown, status?: unknown }} meta
 * @param {EventTickets | null | undefined} tickets
 * @param {string | undefined} webLink
 * @returns {JsonLd | undefined}
 */
function eventOffer(meta, tickets, webLink) {
	if (tickets) {
		const availability =
			tickets.reason === 'soldout'
				? 'https://schema.org/SoldOut'
				: tickets.reason === 'notyet'
					? 'https://schema.org/PreOrder'
					: tickets.open
						? 'https://schema.org/InStock'
						: undefined;
		return clean({
			'@type': 'Offer',
			url: `${SITE_URL}/calendario/${encodeURIComponent(tickets.slug ?? meta.postID ?? '')}/entradas`,
			price: tickets.priceFrom ?? undefined,
			priceCurrency: tickets.priceFrom != null ? 'ARS' : undefined,
			availability,
			validFrom: tickets.opensAt ? isoDate(tickets.opensAt) : undefined
		});
	}
	if (!webLink) return undefined;
	const free = tagList(meta.tags).includes('gratis');
	return clean({
		'@type': 'Offer',
		url: webLink,
		price: free ? 0 : undefined,
		priceCurrency: free ? 'ARS' : undefined,
		availability: LINK_AVAILABILITY[String(meta.status)]
	});
}

/**
 * La disponibilidad del link de inscripción según el «Estado» del evento: abierto, disponible;
 * agotadas, agotado. «Anunciado» (todavía no abrió) y sin estado: no se dice.
 * @type {Readonly<Record<string, string>>}
 */
const LINK_AVAILABILITY = Object.freeze({
	abierto: 'https://schema.org/InStock',
	agotadas: 'https://schema.org/SoldOut'
});

/**
 * @typedef {{ open?: boolean, reason?: string | null, priceFrom?: number | null,
 *   opensAt?: number | null, slug?: string }} EventTickets
 */

/**
 * Un evento (/calendario/<evento>).
 * @param {{
 *   meta: Record<string, any>,
 *   end?: unknown,
 *   venue?: import('./venues.js').VenueView | null,
 *   tickets?: EventTickets | null,
 *   webLink?: string,
 *   past?: boolean,
 *   authorLinks?: readonly AuthorLink[] | null
 * }} input `venue`: el lugar ya filtrado por su privacidad; `webLink`: el link de inscripción (solo
 *   si es web); `past`: el evento ya pasó (sin oferta); `authorLinks`: los perfiles públicos de
 *   les autores ({@link authorLinksFrom})
 */
export function eventSchema({
	meta,
	end,
	venue = null,
	tickets = null,
	webLink,
	past = false,
	authorLinks = null
}) {
	const cancelled = meta.status === 'cancelado';
	const kv = tagList(meta.tags).includes(KINKYVIBE_TAG);
	const organizers = authorsOf(meta.authors, authorLinks ?? []);
	if (kv && !organizers.some((o) => o['@id'] === ORGANIZATION_ID))
		organizers.unshift(organizationRef());
	const image = absoluteUrl(meta.featured);
	return clean({
		'@context': 'https://schema.org',
		'@type': 'Event',
		name: meta.title,
		url: `${SITE_URL}/calendario/${encodeURIComponent(meta.postID ?? '')}`,
		description: meta.summary,
		startDate: isoDate(meta.start),
		endDate: isoDate(end ?? meta.end),
		eventStatus: cancelled
			? 'https://schema.org/EventCancelled'
			: 'https://schema.org/EventScheduled',
		// Con lugar o con «Dónde», presencial; online solo si el evento lo es; sin nada, ni modo
		// ni lugar (eventPlace.js, lo mismo que «Cuándo y dónde»).
		...eventPlaceSchema(/** @type {any} */ (meta), venue, webLink),
		image: image ? [image] : undefined,
		organizer: organizers.length > 1 ? organizers : organizers[0],
		offers: cancelled || past ? undefined : eventOffer(meta, tickets, webLink),
		inLanguage: SITE_LANGUAGE
	});
}

/** El tipo de material según su etiqueta de «tipo de material». @param {unknown} tags */
export function materialType(tags) {
	const list = tagList(tags);
	if (list.includes('descargable')) return 'DigitalDocument';
	if (list.includes('interactivo')) return 'CreativeWork';
	return 'Article';
}

/**
 * Una publicación de material (/material/<post>). Un descargable es a la vez un artículo y un
 * documento (`['Article', 'DigitalDocument']`): así puede salir como artículo en Google.
 * @param {Record<string, any>} meta
 * @param {readonly AuthorLink[] | null} [authorLinks] los perfiles públicos de les autores
 *   ({@link authorLinksFrom})
 */
export function materialSchema(meta, authorLinks = null) {
	const type = materialType(meta.tags);
	const image = absoluteUrl(meta.featured);
	const authors = authorsOf(meta.authors, authorLinks ?? []);
	return clean({
		'@context': 'https://schema.org',
		'@type': type === 'DigitalDocument' ? ['Article', 'DigitalDocument'] : type,
		// `headline` es de CreativeWork (Article lo pide); `name`, el de siempre.
		headline: meta.title,
		name: meta.title,
		url: `${SITE_URL}/material/${encodeURIComponent(meta.postID ?? '')}`,
		description: meta.summary,
		image: image ? [image] : undefined,
		datePublished: isoDate(meta.original_published_date ?? meta.published_date),
		dateModified: isoDate(meta.updated_date ?? meta.published_date),
		author: authors.length > 1 ? authors : authors[0],
		publisher: organizationRef(),
		keywords: tagList(meta.tags).join(', ') || undefined,
		inLanguage: SITE_LANGUAGE
	});
}

/**
 * La serie de un evento (`EventSeries`), por referencia: su nombre y su página.
 * @param {{ name?: string, href?: string } | null | undefined} series
 * @returns {JsonLd | undefined}
 */
export function seriesRef(series) {
	const url = absoluteUrl(series?.href);
	if (!series?.name || !url) return undefined;
	return { '@type': 'EventSeries', '@id': `${url}#serie`, name: series.name, url };
}

/**
 * Un evento con las series de las que es edición (`superEvent`). La serie no es la canónica de
 * las ediciones: cada fecha sigue siendo su propio `Event`.
 * @param {JsonLd} schema lo que dio {@link eventSchema}
 * @param {readonly { name?: string, href?: string }[] | null | undefined} series
 * @returns {JsonLd}
 */
export function withSuperEvent(schema, series) {
	const refs = (series ?? []).map(seriesRef).filter(Boolean);
	if (!refs.length) return schema;
	return { ...schema, superEvent: refs.length > 1 ? refs : refs[0] };
}

/**
 * La página de una serie (/wiki/<serie>): un `EventSeries` con sus ediciones (`subEvent`). De cada
 * edición solo el nombre, la página, la fecha y el estado; **nunca el lugar** (su privacidad se
 * decide en la página de cada evento). Las ediciones son las que ve cualquiera.
 * @param {{ name?: string, href?: string, description?: string, image?: string,
 *   upcoming?: readonly Edition[], past?: readonly Edition[] } | null | undefined} series
 * @returns {JsonLd | null}
 * @typedef {{ title?: string, path?: string, start?: string, status?: string }} Edition
 */
export function seriesSchema(series) {
	const ref = seriesRef(series);
	if (!series || !ref) return null;
	const editions = [...(series.upcoming ?? []), ...(series.past ?? [])];
	return clean({
		'@context': 'https://schema.org',
		...ref,
		image: absoluteUrl(series.image),
		subEvent: editions
			.filter((e) => e.title && absoluteUrl(e.path))
			.sort((a, b) => parseSiteDate(a.start).getTime() - parseSiteDate(b.start).getTime())
			.map((e) =>
				clean({
					'@type': 'Event',
					name: e.title,
					url: absoluteUrl(e.path),
					startDate: isoDate(e.start),
					eventStatus:
						e.status === 'cancelado'
							? 'https://schema.org/EventCancelled'
							: 'https://schema.org/EventScheduled'
				})
			)
	});
}

/**
 * La Kinkipedia como conjunto de términos (va en /wiki y en cada entrada).
 * @returns {JsonLd}
 */
export function kinkipediaRef() {
	return {
		'@type': 'DefinedTermSet',
		'@id': KINKIPEDIA_ID,
		name: 'Kinkipedia',
		url: `${SITE_URL}/wiki`
	};
}

/**
 * /wiki: la Kinkipedia.
 * @returns {JsonLd}
 */
export function kinkipediaSchema() {
	return {
		'@context': 'https://schema.org',
		...kinkipediaRef(),
		description:
			'Enciclopedia fetichista de Kinky Vibe: términos del BDSM, el kink y la comunidad cuir.',
		inLanguage: SITE_LANGUAGE,
		publisher: organizationRef()
	};
}

/**
 * Una entrada de la Kinkipedia (/wiki/<término>) como término definido. Sin entrada, ver
 * {@link tagTermSchema}.
 * @param {{ title?: string, summary?: string, path?: string, aka?: unknown }} entry
 * @returns {JsonLd | null}
 */
export function wikiTermSchema({ title, summary, path, aka }) {
	if (!title || !path) return null;
	return clean({
		'@context': 'https://schema.org',
		'@type': 'DefinedTerm',
		name: title,
		description: summary,
		alternateName: tagList(aka).filter((a) => a !== title),
		url: absoluteUrl(path),
		// Sin `inLanguage`: DefinedTerm no es un CreativeWork (validator.schema.org lo marca).
		inDefinedTermSet: kinkipediaRef()
	});
}

/**
 * La descripción de una etiqueta en texto, en una línea: los links (`[[término]]`,
 * `[[término:texto]]`) quedan como su texto. '' si no hay.
 * @param {unknown} description
 * @returns {string}
 */
export function plainTagDescription(description) {
	return typeof description === 'string'
		? description
				.replace(/\[\[([^\]]*)\]\]/g, (_, inner) => inner.slice(inner.indexOf(':') + 1))
				.replace(/\s+/g, ' ')
				.trim()
		: '';
}

/**
 * La página de una etiqueta sin entrada de la Kinkipedia como término definido, si la etiqueta
 * tiene descripción (la que muestra la página arriba de todo): la descripción, en texto, es la
 * definición. Los links de la descripción (`[[término]]`, `[[término:texto]]`) quedan como su
 * texto. Sin descripción, nada (la página es solo una lista).
 * @param {{ title?: string, description?: unknown, path?: string, aka?: unknown }} tag
 * @returns {JsonLd | null}
 */
export function tagTermSchema({ title, description, path, aka }) {
	const text = plainTagDescription(description);
	if (!text) return null;
	return wikiTermSchema({ title, summary: text, path, aka });
}

/** El tipo de schema.org de cada clase de perfil (docs/amigues.md). */
export const PROFILE_TYPES = Object.freeze({
	persona: 'Person',
	proyecto: 'Organization',
	lugar: 'Place'
});

/**
 * La página de un perfil (/amigues/<perfil>): una ProfilePage con la persona, el proyecto o el
 * lugar. Solo lo que muestra la página: nombre, bio, imagen, sus links, el mail y el teléfono
 * públicos (decisión 0023) y, de un lugar, lo que su nivel de privacidad deja ver.
 * @param {{
 *   profile: { title: string, kind?: string, bio?: string | null, image?: string | null,
 *     links?: string[], email?: string | null, tel?: string | null,
 *     publishedDate?: string | null, updatedDate?: string | null },
 *   canonical: string,
 *   location?: import('./venues.js').VenueView | null
 * }} input
 */
export function profileSchema({ profile: p, canonical, location = null }) {
	const url = absoluteUrl(canonical);
	// El perfil de KinkyVibe es la organización del sitio: el mismo `@id` que la de la portada.
	const isOrg = isOrganizationProfile(canonical);
	const type = isOrg
		? 'Organization'
		: (PROFILE_TYPES[/** @type {keyof typeof PROFILE_TYPES} */ (p.kind)] ?? 'Person');
	const contact = contactItems(p);
	const links = contact.filter((c) => c.kind === 'link').map((c) => c.href);
	const email = contact.find((c) => c.kind === 'email')?.label;
	const tel = contact.find((c) => c.kind === 'tel')?.href.slice('tel:'.length);
	const geo =
		location && location.lat !== undefined && location.lng !== undefined
			? { '@type': 'GeoCoordinates', latitude: location.lat, longitude: location.lng }
			: undefined;
	const entity = clean({
		'@type': type,
		'@id': isOrg ? ORGANIZATION_ID : url ? `${url}#perfil` : undefined,
		name: p.title,
		description: p.bio,
		image: absoluteUrl(p.image),
		url,
		sameAs: links,
		email: type === 'Place' ? undefined : email,
		telephone: tel,
		// La misma dirección que en los eventos (venues.js), solo en los niveles que la muestran.
		address: type === 'Place' ? venuePostalAddress(location) : undefined,
		geo: type === 'Place' ? geo : undefined
	});
	return clean({
		'@context': 'https://schema.org',
		'@type': 'ProfilePage',
		url,
		dateCreated: isoDate(p.publishedDate),
		dateModified: isoDate(p.updatedDate ?? p.publishedDate),
		mainEntity: entity
	});
}

/**
 * ¿Es la página del perfil de KinkyVibe (`/amigues/KinkyVibe`, por su dirección, no por su
 * nombre)?
 * @param {unknown} canonical
 */
function isOrganizationProfile(canonical) {
	if (typeof canonical !== 'string') return false;
	const path = canonical.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '');
	return path.toLowerCase() === `/amigues/${KINKYVIBE_TAG}`.toLowerCase();
}

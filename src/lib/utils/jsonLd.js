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
import { KINKYVIBE_TAG } from './propinas.js';
import { contactItems } from './perfiles.js';
import { ORG_CONTACT_EMAIL } from './organization.js';
import { isoDateTime } from './dates.js';

export const SITE_URL = 'https://kinkyvibe.ar';
export const SITE_NAME = 'Kinky Vibe';
export const SITE_DESCRIPTION =
	'Divulgación disidente, producción de eventos y talleres, gestión comunitaria y editorial. Información y encuentros cuir LGTBQIA+ kinky y de BDSM.';
/** El mismo `@id` que ya usaba la página de inicio. */
export const ORGANIZATION_ID = `${SITE_URL}#organization`;
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
 * (`isoDateTime` de dates.js).
 * @param {unknown} d
 * @returns {string | undefined}
 */
export function isoDate(d) {
	if (d instanceof Date) return isNaN(d.getTime()) ? undefined : d.toISOString();
	if (typeof d === 'number')
		return isNaN(new Date(d).getTime()) ? undefined : new Date(d).toISOString();
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
 * Les autores (`authors:`) como personas por su nombre; KinkyVibe, la organización.
 * @param {unknown} authors
 * @returns {JsonLd[]}
 */
function authorsOf(authors) {
	if (!Array.isArray(authors)) return [];
	return authors
		.filter((a) => typeof a === 'string' && a.trim())
		.map((a) => (a === KINKYVIBE_TAG ? organizationRef() : { '@type': 'Person', name: a }));
}

/** @param {unknown} tags */
const tagList = (tags) => (Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : []);

/**
 * La oferta de un evento: la venta del sitio (si la hay) o el link de inscripción.
 * @param {{ postID?: string, tags?: unknown }} meta
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
		priceCurrency: free ? 'ARS' : undefined
	});
}

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
 *   past?: boolean
 * }} input `venue`: el lugar ya filtrado por su privacidad; `webLink`: el link de inscripción (solo
 *   si es web); `past`: el evento ya pasó (sin oferta)
 */
export function eventSchema({ meta, end, venue = null, tickets = null, webLink, past = false }) {
	const cancelled = meta.status === 'cancelado';
	const kv = tagList(meta.tags).includes(KINKYVIBE_TAG);
	const organizers = authorsOf(meta.authors);
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
		inLanguage: 'es'
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
 * Una publicación de material (/material/<post>).
 * @param {Record<string, any>} meta
 */
export function materialSchema(meta) {
	const type = materialType(meta.tags);
	const image = absoluteUrl(meta.featured);
	const authors = authorsOf(meta.authors);
	return clean({
		'@context': 'https://schema.org',
		'@type': type,
		// `headline` es de Article; los demás tipos usan `name` (los dos siempre valen).
		headline: type === 'Article' ? meta.title : undefined,
		name: meta.title,
		url: `${SITE_URL}/material/${encodeURIComponent(meta.postID ?? '')}`,
		description: meta.summary,
		image: image ? [image] : undefined,
		datePublished: isoDate(meta.original_published_date ?? meta.published_date),
		dateModified: isoDate(meta.updated_date ?? meta.published_date),
		author: authors.length > 1 ? authors : authors[0],
		publisher: organizationRef(),
		keywords: tagList(meta.tags).join(', ') || undefined,
		inLanguage: 'es'
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
		inLanguage: 'es',
		publisher: organizationRef()
	};
}

/**
 * Una entrada de la Kinkipedia (/wiki/<término>) como término definido. Sin entrada (solo la
 * etiqueta), nada: la página no tiene una definición que mostrar.
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

/** El tipo de schema.org de cada clase de perfil (docs/amigues.md). */
export const PROFILE_TYPES = Object.freeze({
	persona: 'Person',
	proyecto: 'Organization',
	lugar: 'Place'
});

/**
 * La dirección de un lugar, solo en los niveles que la muestran (lo demás ya no llega).
 * @param {import('./venues.js').VenueView | null | undefined} view
 * @returns {JsonLd | undefined}
 */
function venueAddress(view) {
	if (!view || view.level === 'hidden' || view.level === 'name') return undefined;
	const locality = [view.area, view.city].filter(Boolean).join(', ');
	const address = clean({
		'@type': 'PostalAddress',
		streetAddress: view.level === 'area' ? undefined : view.address,
		addressLocality: locality || undefined,
		addressCountry: 'AR'
	});
	return address.streetAddress || address.addressLocality ? address : undefined;
}

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
	const type = PROFILE_TYPES[/** @type {keyof typeof PROFILE_TYPES} */ (p.kind)] ?? 'Person';
	const url = absoluteUrl(canonical);
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
		'@id': url ? `${url}#perfil` : undefined,
		name: p.title,
		description: p.bio,
		image: absoluteUrl(p.image),
		url,
		sameAs: links,
		email: type === 'Place' ? undefined : email,
		telephone: tel,
		address: type === 'Place' ? venueAddress(location) : undefined,
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

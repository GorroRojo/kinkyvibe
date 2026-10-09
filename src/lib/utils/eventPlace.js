/**
 * «Dónde» de un evento que no tiene un lugar cargado (para sitios de una sola vez: una plaza, la
 * casa de alguien que lo hace público, un bar que no está en Lugares). Es el `location` en texto
 * libre del frontmatter, que ya usaban la página y el .ics, más un link opcional al mapa
 * (`location_map`: OpenStreetMap o Google Maps, siempre https).
 *
 * Un lugar vinculado («Sucede en», edge `lugar` del evento) manda: con lugar, la página y el .ics
 * muestran el lugar según su privacidad y no se usa ni el `location` ni el `location_map` del .md.
 *
 * Funciones puras: las usan la página del evento, los calendarios .ics, el editor y el guardado.
 */
import { parseDocument } from 'yaml';
import { splitMarkdown } from './eventDraft.js';
import { venueLine, venueSchema } from './venues.js';

/** Largo máximo del link al mapa. */
export const MAP_LINK_MAX = 500;

/**
 * Sitios de mapas aceptados: el host (o un subdominio de él) y, si hace falta, cómo tiene que
 * empezar el camino (google.com también es el buscador).
 * @type {readonly { host: string, path?: RegExp }[]}
 */
const MAP_SITES = Object.freeze([
	{ host: 'openstreetmap.org' },
	{ host: 'osm.org' },
	{ host: 'maps.google.com' },
	{ host: 'google.com', path: /^\/maps(\/|$)/ },
	{ host: 'google.com.ar', path: /^\/maps(\/|$)/ },
	{ host: 'maps.app.goo.gl' },
	{ host: 'goo.gl', path: /^\/maps(\/|$)/ }
]);

/** Lo que se le dice a quien edita cuando el link no sirve. */
export const MAP_LINK_ERROR =
	'El link al mapa tiene que ser una dirección https de OpenStreetMap o Google Maps.';

/**
 * Valida el link al mapa. Vacío vale (es opcional).
 * @param {unknown} raw
 * @returns {{ ok: true, url: string } | { ok: false, message: string }}
 */
export function checkMapLink(raw) {
	const text = typeof raw === 'string' ? raw.trim() : '';
	if (!text) return { ok: true, url: '' };
	if (text.length > MAP_LINK_MAX || /\s/.test(text)) return { ok: false, message: MAP_LINK_ERROR };
	/** @type {URL} */
	let url;
	try {
		url = new URL(text);
	} catch {
		return { ok: false, message: MAP_LINK_ERROR };
	}
	if (url.protocol !== 'https:' || url.username || url.password || url.port) {
		return { ok: false, message: MAP_LINK_ERROR };
	}
	const host = url.hostname.toLowerCase();
	const site = MAP_SITES.find(
		(s) =>
			(host === s.host || host.endsWith(`.${s.host}`)) && (!s.path || s.path.test(url.pathname))
	);
	return site ? { ok: true, url: url.href } : { ok: false, message: MAP_LINK_ERROR };
}

/** Los «Dónde» en texto libre que quieren decir «es online» (sin dirección). */
const ONLINE_WORDS = new Set(['online', 'virtual']);

/** @param {unknown} v */
const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * ¿El evento (sin lugar vinculado) es online? `modalidad: online | presencial` manda (como en la
 * venta, `isOnlineEvent` de ticketsEditor.js). Si falta: un «Dónde» que dice solo «Online» o
 * «Virtual» (así se cargaban los eventos online), o la etiqueta «Online» sin ningún «Dónde».
 * A diferencia de la venta, un nombre de lugar (`location_name`) también cuenta como «Dónde»: un
 * evento con «Zona Inventada | Lugar de Prueba» y la etiqueta Online es presencial (la etiqueta
 * suele quedar de otra edición).
 *
 * @param {Record<string, any>} meta
 */
export function isOnlinePlace(meta) {
	const modalidad = trimmed(meta.modalidad).toLowerCase();
	if (ONLINE_WORDS.has(modalidad)) return true;
	if (modalidad === 'presencial') return false;
	const loc = trimmed(meta.location).toLowerCase();
	const name = trimmed(meta.location_name).toLowerCase();
	if (ONLINE_WORDS.has(loc) || (!loc && ONLINE_WORDS.has(name))) return true;
	if (loc || name) return false;
	const tags = Array.isArray(meta.tags) ? meta.tags : [];
	return tags.some((t) => String(t).trim().toLowerCase() === 'online');
}

/**
 * Lo que muestran la página y el .ics: con lugar, el lugar (según su privacidad) y sin link al
 * mapa del .md; sin lugar, el «Dónde» del .md y su link al mapa si es válido: «Nombre ·
 * Dirección» (como un lugar con nombre y dirección, `venueLine`), o lo que haya de los dos.
 * «Online» solo si el evento es online (`isOnlinePlace`); sin nada cargado, texto vacío (no se
 * inventa que es online).
 *
 * @param {{ location?: unknown, location_name?: unknown, location_map?: unknown, tags?: unknown, modalidad?: unknown }} meta
 * @param {import('./venues.js').VenueView | null} [venue]
 * @returns {{ text: string, mapUrl: string, fromVenue: boolean }}
 */
export function eventPlace(meta, venue) {
	if (venue) return { text: venueLine(venue), mapUrl: '', fromVenue: true };
	const map = checkMapLink(meta.location_map);
	const mapUrl = map.ok ? map.url : '';
	if (isOnlinePlace(meta)) return { text: 'Online', mapUrl, fromVenue: false };
	const name = trimmed(meta.location_name);
	const address = trimmed(meta.location);
	const text =
		name && address && name.toLowerCase() !== address.toLowerCase()
			? `${name} · ${address}`
			: name || address;
	return { text, mapUrl, fromVenue: false };
}

/**
 * El lugar de un evento para sus datos estructurados (schema.org): `eventAttendanceMode` y
 * `location`, coherentes con lo que muestra la página. Con lugar vinculado, el lugar (lo que su
 * nivel deja ver); online, `VirtualLocation` (con el link de inscripción si es web); con «Dónde»,
 * un `Place`; sin nada, sin modo ni lugar (no se dice que es online).
 *
 * @param {Record<string, any>} meta
 * @param {import('./venues.js').VenueView | null | undefined} venue
 * @param {string} [webLink] el link de inscripción, solo si es web
 * @returns {{ eventAttendanceMode?: any, location?: any }}
 */
export function eventPlaceSchema(meta, venue, webLink) {
	const OFFLINE = 'https://schema.org/OfflineEventAttendanceMode';
	if (venue) return { eventAttendanceMode: OFFLINE, location: venueSchema(venue) };
	if (isOnlinePlace(meta)) {
		return {
			eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
			location: { '@type': 'VirtualLocation', url: webLink || undefined }
		};
	}
	const name = trimmed(meta.location_name);
	const address = trimmed(meta.location);
	if (!name && !address) return {};
	return {
		eventAttendanceMode: OFFLINE,
		location: {
			'@type': 'Place',
			name: name || trimmed(meta.title) || address,
			...(address ? { address: { '@type': 'PostalAddress', name: address } } : {})
		}
	};
}

/**
 * Problemas del «Dónde» de un archivo de evento, para el guardado (vacío = todo bien). Un archivo
 * cuyas propiedades no se pueden leer lo valida el resto del guardado.
 * @param {string} content el archivo completo
 * @returns {string[]}
 */
export function placeFileErrors(content) {
	/** @type {Record<string, any>} */
	let meta;
	try {
		const doc = parseDocument(splitMarkdown(content).frontmatter);
		if (doc.errors.length) return [];
		meta = doc.toJS() ?? {};
	} catch {
		return [];
	}
	if (meta.location_map === undefined || meta.location_map === null) return [];
	const map = checkMapLink(String(meta.location_map));
	return map.ok ? [] : [map.message];
}

/** Los campos del «Dónde» del .md (texto libre de quien edita). */
export const MD_PLACE_FIELDS = Object.freeze(['location', 'location_name', 'location_map']);

/**
 * La meta de un evento sin el «Dónde» del .md (`location`, `location_name`, `location_map`).
 * @template {Record<string, any>} M
 * @param {M} meta
 * @returns {M}
 */
export function stripMdPlace(meta) {
	const out = /** @type {Record<string, any>} */ ({ ...meta });
	for (const key of MD_PLACE_FIELDS) delete out[key];
	return /** @type {M} */ (out);
}

/**
 * El lugar en pocas palabras (carrusel, imagen para compartir): el nombre si su nivel lo deja
 * ver; si no, lo que se ve de la dirección, o «Lugar a confirmar».
 * @param {import('./venues.js').VenueView} venue
 */
export function venueShortLabel(venue) {
	if ((venue.level === 'public' || venue.level === 'name') && venue.name) return venue.name;
	return venueLine(venue) || 'Lugar a confirmar';
}

/**
 * Un lugar vinculado manda (como en la página del evento): la meta que pueden usar las salidas
 * públicas (listas, carrusel, /api/posts, la imagen para compartir) con el «Dónde» del .md
 * cambiado por lo que el nivel del lugar deja ver. `location_name` es el lugar en pocas palabras
 * y `location` la dirección si el nivel la muestra junto al nombre ("Nombre + dirección"); si no,
 * lo mismo que `location_name` (nunca vacía: un evento con lugar no pasa por online). El link al
 * mapa del .md no va. Sin lugar, la meta como está.
 *
 * @template {Record<string, any>} M
 * @param {M} meta
 * @param {import('./venues.js').VenueView | null | undefined} venue
 * @returns {M}
 */
export function venuePlaceMeta(meta, venue) {
	if (!venue) return meta;
	const label = venueShortLabel(venue);
	return /** @type {M} */ ({
		...stripMdPlace(meta),
		location_name: label,
		location: (venue.level === 'public' && venue.address) || label
	});
}

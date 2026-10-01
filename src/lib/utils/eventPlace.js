/**
 * «Dónde» de un evento que no tiene un lugar cargado (para sitios de una sola vez: una plaza, la
 * casa de alguien que lo hace público, un bar que no está en Lugares). Es el `location` en texto
 * libre del frontmatter, que ya usaban la página y el .ics, más un link opcional al mapa
 * (`location_map`: OpenStreetMap o Google Maps, siempre https).
 *
 * Un lugar vinculado («Sucede en», `event_venues`) manda: con lugar, la página y el .ics muestran
 * el lugar según su privacidad y no se usa ni el `location` ni el `location_map` del .md.
 *
 * Funciones puras: las usan la página del evento, los calendarios .ics, el editor y el guardado.
 */
import { parseDocument } from 'yaml';
import { splitMarkdown } from './eventDraft.js';
import { venueLine } from './venues.js';

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

/**
 * Lo que muestran la página y el .ics: con lugar, el lugar (según su privacidad) y sin link al
 * mapa del .md; sin lugar, el «Dónde» del .md (o «Online») y su link al mapa si es válido.
 *
 * @param {{ location?: unknown, location_map?: unknown }} meta
 * @param {import('./venues.js').VenueView | null} [venue]
 * @returns {{ text: string, mapUrl: string, fromVenue: boolean }}
 */
export function eventPlace(meta, venue) {
	if (venue) return { text: venueLine(venue), mapUrl: '', fromVenue: true };
	const text = typeof meta.location === 'string' ? meta.location.trim() : '';
	const map = checkMapLink(meta.location_map);
	return { text: text || 'Online', mapUrl: map.ok ? map.url : '', fromVenue: false };
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

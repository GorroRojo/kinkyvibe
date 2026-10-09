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

/** El texto del «Dónde» de un evento online (página, .ics, listas, mails, entradas). */
export const ONLINE_PLACE_TEXT = 'Online';

/**
 * Texto para comparar: sin tildes, en minúsculas, sin puntuación y con un solo espacio.
 * @param {unknown} raw
 */
export function normalizePlaceText(raw) {
	return String(raw ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/**
 * Lo que dice un «Dónde» de un evento online (ya normalizado con {@link normalizePlaceText}). Es
 * la única lista: la usan la página, la venta, el aviso «Online con lugar», «Importar de
 * eventos» y el importador de la planilla.
 */
export const ONLINE_WORDS = new Set([
	'online',
	'virtual',
	'zoom',
	'meet',
	'google meet',
	'jitsi',
	'discord',
	'por zoom',
	'por meet'
]);

/**
 * ¿El texto dice «es online» («Online», «Virtual», «Zoom»…)? Sin importar mayúsculas, tildes,
 * espacios ni puntuación.
 * @param {unknown} v
 */
export function isOnlineWord(v) {
	return ONLINE_WORDS.has(normalizePlaceText(v));
}

/**
 * Las formas de escribir la etiqueta Online en un evento: «Online» y los alias que acepta el
 * editor para el lugar (`EVENT_ALIASES` de adminTags.js: «online», «virtual»).
 */
const ONLINE_TAGS = new Set(['online', 'virtual']);

/**
 * ¿Tiene la etiqueta Online? Sin importar mayúsculas, tildes ni espacios.
 * @param {unknown} tags
 */
export function hasOnlineTag(tags) {
	const list = Array.isArray(tags) ? tags : [];
	return list.some((t) => ONLINE_TAGS.has(normalizePlaceText(t)));
}

/** @param {unknown} v */
const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * Lo que dice el campo `modalidad` del frontmatter: «online» (u «virtual»), «presencial» o ''
 * (no dice nada: se decide por el «Dónde» y las etiquetas).
 * @param {Record<string, any> | null | undefined} meta
 * @returns {'online' | 'presencial' | ''}
 */
export function modalidadOf(meta) {
	const m = normalizePlaceText(meta?.modalidad);
	if (m === 'online' || m === 'virtual') return 'online';
	if (m === 'presencial') return 'presencial';
	return '';
}

/**
 * **La** regla de si un evento es online o presencial (página, .ics, schema.org, listas,
 * carrusel, imagen para compartir, panel, «Qué falta», «Importar de eventos»). En orden:
 *
 * 1. un lugar vinculado («Sucede en», `hasVenue`) manda: presencial;
 * 2. `modalidad: online | presencial` (como en la venta);
 * 3. un «Dónde» que dice solo «Online», «Virtual», «Zoom»… (`location`, o `location_name` sin
 *    `location`): online;
 * 4. cualquier otro «Dónde» (`location` o `location_name`): presencial. Un evento con «Zona
 *    Inventada | Lugar de Prueba» y la etiqueta Online es presencial (la etiqueta suele quedar de
 *    otra edición: lo marca `onlineTagMismatch`);
 * 5. sin «Dónde», la etiqueta Online (o «virtual»): online;
 * 6. sin nada: '' (no se sabe; no se inventa que es online).
 *
 * No hay eventos híbridos en los datos. La venta de entradas decide con su propia regla
 * ({@link isOnlineEvent}), que puede no coincidir: ver ese comentario.
 *
 * @param {Record<string, any> | null | undefined} meta
 * @param {{ hasVenue?: boolean }} [opts]
 * @returns {'online' | 'presencial' | ''}
 */
export function eventMode(meta, { hasVenue = false } = {}) {
	if (hasVenue) return 'presencial';
	const m = meta ?? {};
	const modalidad = modalidadOf(m);
	if (modalidad) return modalidad;
	const loc = trimmed(m.location);
	const name = trimmed(m.location_name);
	if (isOnlineWord(loc) || (!loc && isOnlineWord(name))) return 'online';
	if (loc || name) return 'presencial';
	return hasOnlineTag(m.tags) ? 'online' : '';
}

/**
 * ¿El evento (sin lugar vinculado) es online? `eventMode(meta) === 'online'`.
 * @param {Record<string, any>} meta
 */
export function isOnlinePlace(meta) {
	return eventMode(meta) === 'online';
}

/**
 * ¿La **venta de entradas** trata al evento como online? Entonces las entradas llevan el link de
 * la transmisión en lugar de un QR, no hay puerta ni control de ingreso, y los mails y la página
 * de cada entrada dicen «Online». `modalidad: online | presencial` manda; si falta, es online si
 * tiene la etiqueta Online y no tiene `location` (aunque tenga `location_name` o un lugar
 * vinculado).
 *
 * Difiere de {@link eventMode} a propósito (cambiarla cambia qué reciben quienes ya compraron):
 * con la etiqueta Online y solo un nombre de lugar, la venta dice online y la página presencial
 * (lo avisa `onlineTagMismatch`); con un «Dónde» «Online» sin etiqueta ni `modalidad`, la página
 * dice online y la venta presencial. Para no depender de esto, cargá `modalidad`.
 *
 * @param {Record<string, any>} meta
 */
export function isOnlineEvent(meta) {
	const modalidad = modalidadOf(meta);
	if (modalidad) return modalidad === 'online';
	return !meta.location && hasOnlineTag(meta.tags);
}

/**
 * «Nombre · Dirección» (como un lugar con nombre y dirección, `venueLine`), o lo que haya de los
 * dos; el mismo texto en los dos, una sola vez. '' sin nada.
 * @param {unknown} name
 * @param {unknown} address
 */
export function placeLine(name, address) {
	const n = trimmed(name);
	const a = trimmed(address);
	return n && a && n.toLowerCase() !== a.toLowerCase() ? `${n} · ${a}` : n || a;
}

/**
 * El lugar en los mails de entradas, la página de compra y la de cada entrada: «Online» si la
 * venta lo trata como online ({@link isOnlineEvent}, así coincide con el link en vez del QR); si
 * no, «Nombre · Dirección».
 * @param {boolean} online lo que dice la venta (`config.online`)
 * @param {{ location?: unknown, location_name?: unknown } | null | undefined} place
 */
export function salePlaceText(online, place) {
	return online ? ONLINE_PLACE_TEXT : placeLine(place?.location_name, place?.location);
}

/**
 * El «Dónde» en pocas palabras (carrusel, imagen para compartir): «Online» si el evento es online
 * ({@link eventMode}); si no, el nombre del lugar o, sin nombre, la dirección; '' sin nada. Con
 * lugar vinculado, pasale la meta de {@link venuePlaceMeta}.
 * @param {Record<string, any>} meta
 */
export function placeShort(meta) {
	if (eventMode(meta) === 'online') return ONLINE_PLACE_TEXT;
	return trimmed(meta?.location_name) || trimmed(meta?.location);
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
	if (isOnlinePlace(meta)) return { text: ONLINE_PLACE_TEXT, mapUrl, fromVenue: false };
	return { text: placeLine(meta.location_name, meta.location), mapUrl, fromVenue: false };
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

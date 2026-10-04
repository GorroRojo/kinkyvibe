/**
 * Lugares (decisión B3): la privacidad de su dirección y lo que se muestra en cada nivel.
 * Funciones puras, sin base: las usan el servidor (páginas, mails) y el panel.
 *
 * Niveles (cada lugar tiene uno por defecto y cada evento lo puede cambiar; ver docs/amigues.md):
 * - `public`: nombre, dirección, barrio, ciudad, mapa, accesibilidad y cómo llegar;
 * - `name`: solo el nombre, con el link a la página del lugar;
 * - `address`: la dirección (calle y número, barrio, ciudad) y el mapa, sin el nombre ni el link
 *   (por ejemplo una casa particular, donde el nombre delataría a alguien; decisión de gorrite);
 * - `area`: solo el barrio y la ciudad (el nombre no: identificaría el lugar);
 * - `hidden`: nada.
 * En todos los niveles menos `public`, quien compra entrada recibe el lugar completo (nombre y
 * dirección) en el mail y en la página de su entrada.
 */

import { textOrNull } from './text.js';

/** @typedef {'public' | 'name' | 'address' | 'area' | 'hidden'} VenuePrivacy */

/**
 * En el orden en que se ofrecen en los desplegables. La migración 0027 agrega `address` al CHECK
 * del edge `lugar` del evento (`data.privacy`).
 * @type {readonly VenuePrivacy[]}
 */
export const VENUE_PRIVACY_LEVELS = Object.freeze(['public', 'name', 'address', 'area', 'hidden']);

/**
 * Sin nivel elegido, un lugar muestra la dirección completa (decisión de gorrite): quien no la
 * quiere pública elige otro nivel en el lugar o en el evento. Es el único lugar que lo decide.
 * @type {VenuePrivacy}
 */
export const DEFAULT_VENUE_PRIVACY = 'public';

/**
 * Qué se muestra en cada nivel: las opciones de los desplegables, las columnas del panel, los CSV
 * y el registro de actividad. Un solo mapa para que se lea igual en todos lados; los textos (con
 * "Sólo" con tilde y esas mayúsculas) son los que pidió gorrite.
 * @type {Readonly<Record<VenuePrivacy, string>>}
 */
export const VENUE_PRIVACY_LABELS = Object.freeze({
	public: 'Nombre + dirección',
	name: 'Sólo Nombre',
	address: 'Sólo dirección',
	area: 'Sólo dirección parcial (Barrio)',
	hidden: 'Nada'
});

/** La opción "sin elegir" del nivel de un lugar (vale el nivel por defecto). */
export const VENUE_PRIVACY_UNSET_LABEL = `Sin elegir (${VENUE_PRIVACY_LABELS[DEFAULT_VENUE_PRIVACY]})`;

/** Aviso para el público cuando la dirección no se muestra. */
export const ADDRESS_FOR_BUYERS = 'Te mandamos la dirección con tu entrada.';

/**
 * @param {unknown} value
 * @returns {value is VenuePrivacy}
 */
export function isVenuePrivacy(value) {
	return (
		typeof value === 'string' &&
		/** @type {readonly string[]} */ (VENUE_PRIVACY_LEVELS).includes(value)
	);
}

/**
 * El nivel que vale para un evento: el del evento si tiene uno, si no el del lugar.
 *
 * @param {unknown} eventOverride
 * @param {unknown} venueDefault
 * @returns {VenuePrivacy}
 */
export function effectivePrivacy(eventOverride, venueDefault) {
	if (isVenuePrivacy(eventOverride)) return eventOverride;
	if (isVenuePrivacy(venueDefault)) return venueDefault;
	return DEFAULT_VENUE_PRIVACY;
}

/**
 * La opción "igual que el lugar" del nivel de un evento, con el nivel que vale ahora: el del
 * lugar elegido, o el por defecto si el lugar no tiene uno ("Igual que el Lugar (Sólo Nombre)").
 *
 * @param {unknown} venueDefault
 */
export function inheritPrivacyLabel(venueDefault) {
	return `Igual que el Lugar (${VENUE_PRIVACY_LABELS[effectivePrivacy(null, venueDefault)]})`;
}

/**
 * Qué se muestra de la dirección en un evento, en palabras: el nivel del evento si tiene uno,
 * si no "igual que el lugar" con el nivel del lugar.
 *
 * @param {unknown} eventOverride
 * @param {unknown} venueDefault
 */
export function eventPrivacyText(eventOverride, venueDefault) {
	return isVenuePrivacy(eventOverride)
		? VENUE_PRIVACY_LABELS[eventOverride]
		: inheritPrivacyLabel(venueDefault);
}

/**
 * ¿En este nivel se ve el link al lugar? (Solo así el lugar puede listar el evento en su página.)
 *
 * @param {VenuePrivacy} level
 */
export function showsVenueLink(level) {
	return level === 'public' || level === 'name';
}

/**
 * El nivel con el que se ve la página de un lugar (su nivel por defecto). La página muestra
 * siempre el nombre, así que en "Sólo dirección" no puede mostrar también la dirección (juntaría
 * las dos cosas): ahí se ve como "Sólo Nombre". Lo usan la página del lugar y el buscador, así
 * muestran lo mismo.
 *
 * @param {unknown} venueDefault el `venue_privacy` del lugar
 * @returns {VenuePrivacy}
 */
export function venuePageLevel(venueDefault) {
	const level = effectivePrivacy(null, venueDefault);
	return level === 'address' ? 'name' : level;
}

/**
 * ¿En este nivel se ve la dirección (calle y número) y el mapa? Si no, la página del evento avisa
 * que la dirección llega con la entrada ({@link ADDRESS_FOR_BUYERS}).
 *
 * @param {VenuePrivacy} level
 */
export function showsAddress(level) {
	return level === 'public' || level === 'address';
}

/**
 * @typedef {{
 *   level: VenuePrivacy,
 *   name?: string,
 *   href?: string,
 *   address?: string,
 *   area?: string,
 *   city?: string,
 *   lat?: number,
 *   lng?: number,
 *   accessibility?: string,
 *   howTo?: string
 * }} VenueView
 */

/**
 * Lo que se muestra de un lugar en un nivel: una lista blanca. Lo que no está en el nivel no
 * sale de acá (ni en el HTML, ni en el JSON de la página).
 *
 * @param {{ title: string, data: Record<string, unknown> }} venue
 * @param {VenuePrivacy} level
 * @param {string} href la página del lugar
 * @returns {VenueView}
 */
export function venueView(venue, level, href) {
	const d = venue.data ?? {};
	/** @param {unknown} v */
	const s = (v) => textOrNull(v) ?? undefined;
	/** @param {unknown} v */
	const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
	if (level === 'public') {
		/** @type {VenueView} */
		const view = { level, name: venue.title, href };
		const fields = {
			address: s(d.address),
			area: s(d.area),
			city: s(d.city),
			accessibility: s(d.accessibility),
			howTo: s(d.how_to_get_there)
		};
		for (const [k, v] of Object.entries(fields)) if (v) /** @type {any} */ (view)[k] = v;
		const lat = n(d.lat);
		const lng = n(d.lng);
		if (lat !== undefined && lng !== undefined) Object.assign(view, { lat, lng });
		return view;
	}
	if (level === 'name') return { level, name: venue.title, href };
	if (level === 'address') {
		// Sin el nombre ni el link (lo delatarían), y sin los textos libres (cómo llegar,
		// accesibilidad), que pueden nombrarlo. El mapa sí (decisión de gorrite).
		/** @type {VenueView} */
		const view = { level };
		const fields = { address: s(d.address), area: s(d.area), city: s(d.city) };
		for (const [k, v] of Object.entries(fields)) if (v) /** @type {any} */ (view)[k] = v;
		const lat = n(d.lat);
		const lng = n(d.lng);
		if (lat !== undefined && lng !== undefined) Object.assign(view, { lat, lng });
		return view;
	}
	if (level === 'area') {
		/** @type {VenueView} */
		const view = { level };
		const area = s(d.area);
		const city = s(d.city);
		if (area) view.area = area;
		if (city) view.city = city;
		return view;
	}
	return { level: 'hidden' };
}

/**
 * El lugar en una línea, para el encabezado de un evento (ya filtrado por su nivel).
 *
 * @param {VenueView} view
 */
export function venueLine(view) {
	if (view.level === 'public') return [view.name, view.address].filter(Boolean).join(' · ');
	if (view.level === 'name') return view.name ?? '';
	if (view.level === 'address') {
		return [view.address, view.area, view.city].filter(Boolean).join(', ') || 'Lugar a confirmar';
	}
	const place = [view.area, view.city].filter(Boolean).join(', ');
	return view.level === 'area' && place ? place : 'Lugar a confirmar';
}

/**
 * El lugar para los datos estructurados (schema.org) de un evento: solo lo que su nivel deja ver.
 *
 * @param {VenueView} view
 * @returns {{ '@type': 'Place', name: string, address?: { '@type': 'PostalAddress', name: string } } | undefined}
 */
export function venueSchema(view) {
	if (view.level === 'public' && view.name) {
		return view.address
			? {
					'@type': 'Place',
					name: view.name,
					address: { '@type': 'PostalAddress', name: view.address }
				}
			: { '@type': 'Place', name: view.name };
	}
	if (view.level === 'name' && view.name) return { '@type': 'Place', name: view.name };
	if (view.level === 'address') {
		const line = [view.address, view.area, view.city].filter(Boolean).join(', ');
		if (line)
			return { '@type': 'Place', name: line, address: { '@type': 'PostalAddress', name: line } };
	}
	if (view.level === 'area') {
		const place = [view.area, view.city].filter(Boolean).join(', ');
		if (place) return { '@type': 'Place', name: place };
	}
	return undefined;
}

/**
 * La dirección completa en una línea ("Calle 123, Barrio, Ciudad"), para quien compró.
 *
 * @param {Record<string, unknown>} data
 */
export function fullAddress(data) {
	return [data.address, data.area, data.city]
		.map((v) => (typeof v === 'string' ? v.trim() : ''))
		.filter(Boolean)
		.join(', ');
}

/**
 * Link a OpenStreetMap con un marcador.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} [zoom]
 */
export function osmLink(lat, lng, zoom = 17) {
	const la = lat.toFixed(6);
	const lo = lng.toFixed(6);
	return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=${zoom}/${la}/${lo}`;
}

/**
 * El link "Ver en Google Maps" de un lugar ya filtrado por su nivel, o `undefined` si el nivel no
 * muestra la dirección (pedido de gorrite: solo "Nombre + dirección" y "Sólo dirección"). Es un
 * link común, sin mapa embebido. Con el punto en el mapa busca el punto; si no, la dirección. En
 * "Sólo dirección" la búsqueda nunca lleva el nombre del lugar (la vista ni siquiera lo trae).
 *
 * @param {VenueView} view
 * @returns {string | undefined}
 */
export function googleMapsLink(view) {
	if (!showsAddress(view.level)) return undefined;
	let query = '';
	if (view.lat !== undefined && view.lng !== undefined) {
		query = `${view.lat},${view.lng}`;
	} else if (view.address) {
		const name = view.level === 'public' ? view.name : undefined;
		query = [name, view.address, view.area, view.city].filter(Boolean).join(', ');
	}
	if (!query) return undefined;
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Las baldosas de OpenStreetMap para un mapa estático chico (sin librerías: imágenes comunes),
 * con el punto en el centro.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{ zoom?: number, width?: number, height?: number }} [opts] tamaño en píxeles
 * @returns {{ tiles: { x: number, y: number, left: number, top: number, url: string }[], zoom: number }}
 */
export function osmTiles(lat, lng, { zoom = 16, width = 320, height = 200 } = {}) {
	const size = 256;
	const scale = 2 ** zoom;
	const rad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
	const px = ((lng + 180) / 360) * scale * size;
	const py = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale * size;
	const left0 = px - width / 2;
	const top0 = py - height / 2;
	const tiles = [];
	for (let x = Math.floor(left0 / size); x * size < left0 + width; x++) {
		for (let y = Math.floor(top0 / size); y * size < top0 + height; y++) {
			if (y < 0 || y >= scale) continue;
			const wrapped = ((x % scale) + scale) % scale;
			tiles.push({
				x: wrapped,
				y,
				left: Math.round(x * size - left0),
				top: Math.round(y * size - top0),
				url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`
			});
		}
	}
	return { tiles, zoom };
}

/**
 * Un número escrito a mano ("-34,6037" o "-34.6037"), o `undefined` si está vacío. Lo que no es
 * un número queda como texto para que la validación del tipo `perfil` lo marque. Lo usan el
 * editor del panel y Mi rincón (la ubicación en el mapa de un lugar).
 *
 * @param {string} raw
 * @returns {number | string | undefined}
 */
export function parseCoordinate(raw) {
	const t = String(raw ?? '')
		.trim()
		.replace(',', '.');
	if (!t) return undefined;
	const n = Number(t);
	return Number.isFinite(n) ? n : t;
}

/**
 * Una coordenada guardada, como se muestra en el formulario ('' si no hay).
 *
 * @param {unknown} value
 */
export function coordinateText(value) {
	return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/** Largo máximo del motivo de un rechazo (migración 0025, `profile_rejections.reason`). */
export const REJECT_REASON_MAX = 300;

/**
 * El motivo de un rechazo como se guarda: sin espacios de más y cortado al máximo.
 *
 * @param {unknown} raw
 */
export function cleanRejectReason(raw) {
	return (typeof raw === 'string' ? raw : '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, REJECT_REASON_MAX);
}

/** @typedef {'approved' | 'pending' | 'rejected'} ReviewState */

/**
 * En qué está un perfil que cargó una cuenta: aprobado (aparece en el sitio), esperando o
 * rechazado. Aprobar gana (al aprobar se borra el rechazo, pero por las dudas).
 *
 * @param {boolean} approved
 * @param {boolean} rejected
 * @returns {ReviewState}
 */
export function reviewState(approved, rejected) {
	if (approved) return 'approved';
	return rejected ? 'rejected' : 'pending';
}

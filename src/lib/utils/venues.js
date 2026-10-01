/**
 * Lugares (decisión B3): la privacidad de su dirección y lo que se muestra en cada nivel.
 * Funciones puras, sin base: las usan el servidor (páginas, mails) y el panel.
 *
 * Niveles, de más a menos visible (cada lugar tiene uno por defecto y cada evento lo puede
 * cambiar; ver docs/amigues.md):
 * 1. `public`: nombre, dirección, barrio, ciudad, mapa, accesibilidad y cómo llegar;
 * 2. `name`: solo el nombre, con el link a la página del lugar;
 * 3. `area`: solo el barrio y la ciudad (el nombre no: identificaría el lugar);
 * 4. `hidden`: nada.
 * En los niveles 2 a 4, quien compra entrada recibe la dirección completa en el mail y en la
 * página de su entrada.
 */

/** @typedef {'public' | 'name' | 'area' | 'hidden'} VenuePrivacy */

/** @type {readonly VenuePrivacy[]} */
export const VENUE_PRIVACY_LEVELS = Object.freeze(['public', 'name', 'area', 'hidden']);

/**
 * Sin nivel elegido, un lugar muestra solo su nombre. DECIDIDO POR CLAUDE, A CONFIRMAR: ante la
 * duda, no se muestra la dirección (el lugar la puede hacer pública cuando quiera).
 * @type {VenuePrivacy}
 */
export const DEFAULT_VENUE_PRIVACY = 'name';

/** Textos del panel y de las páginas. */
export const VENUE_PRIVACY_LABELS = Object.freeze({
	public: 'Pública: nombre y dirección',
	name: 'Solo el nombre',
	area: 'Solo el barrio',
	hidden: 'Oculta'
});

/** Aviso para el público cuando la dirección no se muestra. */
export const ADDRESS_FOR_BUYERS = 'Te mandamos la dirección con tu entrada.';

/**
 * @param {unknown} value
 * @returns {value is VenuePrivacy}
 */
export function isVenuePrivacy(value) {
	return typeof value === 'string' && /** @type {readonly string[]} */ (VENUE_PRIVACY_LEVELS).includes(value);
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
 * ¿En este nivel se ve el link al lugar? (Solo así el lugar puede listar el evento en su página.)
 *
 * @param {VenuePrivacy} level
 */
export function showsVenueLink(level) {
	return level === 'public' || level === 'name';
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
	const s = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
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
			? { '@type': 'Place', name: view.name, address: { '@type': 'PostalAddress', name: view.address } }
			: { '@type': 'Place', name: view.name };
	}
	if (view.level === 'name' && view.name) return { '@type': 'Place', name: view.name };
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

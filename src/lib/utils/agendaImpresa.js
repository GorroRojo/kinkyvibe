/**
 * Agenda impresa (Eventos › Agenda › «Agenda impresa»): los volantes para repartir en papel con
 * los próximos eventos, como el diseño de gorrite (docs/panel.md#agenda-impresa). Funciones
 * puras: arman cada fila de un volante a partir de un evento (fecha, lugar, precio, ícono y
 * subtítulo de su serie) y le aplican lo que se cambió a mano en la página. Nada se guarda.
 *
 * El lugar respeta la privacidad igual que la página pública: recibe el lugar **como lo ve
 * cualquiera** (`feedVenues`, ya filtrado por su nivel) y nunca muestra una dirección que el
 * nivel no deja ver.
 */
import { MONTHS_ES, WEEKDAYS_ES, argDate, argTime, toArgentina } from './dates.js';
import { ONLINE_PLACE_TEXT, eventMode } from './eventPlace.js';
import { formatARS } from './money.js';
import { showsAddress } from './venues.js';

/** El encabezado de cada volante. */
export const DEFAULT_HEADER = 'Mirá todas las actividades que preparamos para estos días';
/** El pie de cada volante. */
export const DEFAULT_FOOTER = '+ info en kinkyvibe.ar/calendario';
/** Adónde lleva el QR (opcional) del pie. */
export const CALENDAR_URL = 'https://kinkyvibe.ar/calendario';
/** El ícono de un evento sin serie (o de una serie sin ícono). */
export const FALLBACK_ICON = '✨';
/** Íconos para elegir rápido (el campo acepta cualquier emoji). */
export const ICON_CHOICES = Object.freeze([
	'✨',
	'🔥',
	'🌶️',
	'🎊',
	'💪',
	'👋',
	'🪢',
	'⛓️',
	'🕯️',
	'🎭',
	'💬',
	'🎬',
	'🧉',
	'💻',
	'❤️',
	'🖤'
]);
/** Cuántos eventos entran en un volante (como el diseño). */
export const MAX_PER_FLYER = 4;
/** Cuántos días muestra la página si no se elige un rango. */
export const DEFAULT_RANGE_DAYS = 14;
/** El rango más largo que se puede pedir (para no listar el año entero). */
export const MAX_RANGE_DAYS = 120;
/** Lo que va en el lugar cuando la dirección no se publica. */
export const PRIVATE_ADDRESS_NOTE = 'dirección x privado';
/** Un subtítulo más largo que esto no entra en la píldora: queda vacío. */
export const SUBTITLE_MAX = 70;

/**
 * Cuántos volantes por hoja A4 y de qué tamaño (mm). 4 = A6 en 2×2, 2 = A5 (A4 apaisado, uno al
 * lado del otro), 1 = A4.
 * @type {Readonly<Record<string, { perSheet: number, cols: number, rows: number, sheetW: number, sheetH: number, label: string }>>}
 */
export const LAYOUTS = Object.freeze({
	4: { perSheet: 4, cols: 2, rows: 2, sheetW: 210, sheetH: 297, label: '4 por hoja (A6)' },
	2: { perSheet: 2, cols: 2, rows: 1, sheetW: 297, sheetH: 210, label: '2 por hoja (A5)' },
	1: { perSheet: 1, cols: 1, rows: 1, sheetW: 210, sheetH: 297, label: '1 por hoja (A4)' }
});

/**
 * @typedef {{
 *   slug: string,
 *   title: string,
 *   start: string,
 *   tags?: readonly string[],
 *   meta?: Record<string, any>,
 *   venue?: import('./venues.js').VenueView | null,
 *   types?: readonly FlyerTicketType[] | null,
 *   series?: { name: string, icon?: string, description?: string } | null
 * }} FlyerEvent `venue`: el lugar vinculado como lo ve cualquiera (o `null`); `types`: los tipos
 *   de entrada del evento (o `null` si no vende por el sitio)
 * @typedef {{ price: number, gorra?: unknown, tiers?: readonly { price: number, until: number | null }[] | null }} FlyerTicketType
 * @typedef {{ slug: string, title: string, date: string, icon: string, subtitle: string,
 *   place: string, price: string }} FlyerRow
 * @typedef {Partial<Pick<FlyerRow, 'icon' | 'subtitle' | 'place' | 'price'>>} FlyerOverrides
 */

/** @param {unknown} v */
const trimmed = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * «sábado 26 de julio. 20:00 hs», en hora de Argentina (el diseño lleva «hs»; el volante lo
 * pasa a mayúsculas con CSS). '' si la fecha no se entiende.
 * @param {string | number | Date} start
 */
export function flyerDateLine(start) {
	const d = toArgentina(start);
	if (isNaN(d.getTime())) return '';
	return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} de ${MONTHS_ES[d.getMonth()]}. ${argTime(start)} hs`;
}

/**
 * El lugar en una línea: «Online» si el evento es online; con lugar vinculado, lo que su nivel
 * deja ver (la dirección y el barrio si se ven; si no, el nombre o el barrio con «dirección x
 * privado»); sin lugar, el «Dónde» en texto libre (que ya es público). '' sin nada.
 * @param {Record<string, any> | null | undefined} meta
 * @param {import('./venues.js').VenueView | null | undefined} venue
 */
export function flyerPlaceText(meta, venue) {
	if (venue) {
		const note = (/** @type {string} */ what) =>
			what ? `${what} (${PRIVATE_ADDRESS_NOTE})` : capitalize(PRIVATE_ADDRESS_NOTE);
		if (showsAddress(venue.level)) {
			const line = [venue.address, venue.area].filter(Boolean).join(', ');
			if (line) return line;
			if (venue.level === 'public' && venue.name) return venue.name;
			return [venue.area, venue.city].filter(Boolean).join(', ') || note('');
		}
		if (venue.level === 'name') return note(venue.name ?? '');
		if (venue.level === 'area') return note(venue.area || venue.city || '');
		return note('');
	}
	if (eventMode(meta) === 'online') return ONLINE_PLACE_TEXT;
	return trimmed(meta?.location) || trimmed(meta?.location_name);
}

/**
 * Las formas largas de nombrar la Ciudad de Buenos Aires que se acortan a «CABA» en el volante.
 * Sin importar mayúsculas; «Autónoma» con o sin tilde; «C.A.B.A.» con o sin el último punto.
 */
const CABA_RE =
	/\bciudad\s+aut[oó]noma\s+de\s+buenos\s+aires\b|\bc\.\s?a\.\s?b\.\s?a\b\.?|\bcapital\s+federal\b/giu;

/**
 * Acorta «Ciudad Autónoma de Buenos Aires» (y «Ciudad Autonoma de Buenos Aires», «C.A.B.A.»,
 * «Capital Federal») a «CABA», para que una dirección larga entre en el volante. Solo para el
 * volante: no cambia los datos ni lo que muestra el sitio. También junta espacios repetidos.
 * @param {string} text
 */
export function shortenCity(text) {
	return String(text ?? '')
		.replace(CABA_RE, 'CABA')
		.replace(/\s+/g, ' ')
		.trim();
}

/** @param {string} s */
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * El precio, con las mismas reglas que el precio en la puerta de la página pública
 * (`doorPricesText`): un solo precio, «Entrada: $ 16.500»; varios, «Desde $ 10.000»; tipos a la
 * gorra, «A la gorra» (o «Entrada: $ 5.000 o a la gorra»); un único precio 0, «Gratis». Un tipo
 * con tramos (preventas) cuenta con los tramos que todavía no vencieron por fecha. Sin entradas
 * por el sitio, lo que dicen las etiquetas («Gratis», «A la gorra»), o '' (la línea no va).
 * @param {readonly FlyerTicketType[] | null | undefined} types
 * @param {readonly string[] | null | undefined} tags
 * @param {number} [now]
 */
export function flyerPriceText(types, tags, now = Date.now()) {
	/** @type {readonly FlyerTicketType[]} */
	const list = types ?? [];
	if (list.length) {
		/** @type {Set<number>} */
		const prices = new Set();
		for (const t of list) {
			if (t.gorra) continue;
			const tiers = (t.tiers ?? []).filter((x) => x.until === null || x.until > now);
			if (t.tiers?.length) for (const x of tiers) prices.add(x.price);
			else prices.add(t.price);
		}
		const gorra = list.some((t) => t.gorra);
		const sorted = [...prices].sort((a, b) => a - b);
		if (!sorted.length) return gorra ? 'A la gorra' : '';
		if (sorted.length > 1) return `Desde ${formatARS(sorted[0])}${gorra ? ' o a la gorra' : ''}`;
		if (sorted[0] === 0) return gorra ? 'Gratis o a la gorra' : 'Gratis';
		return `Entrada: ${formatARS(sorted[0])}${gorra ? ' o a la gorra' : ''}`;
	}
	const t = (tags ?? []).map((x) => String(x).trim().toLowerCase());
	if (t.includes('gratis')) return 'Gratis';
	if (t.includes('a la gorra')) return 'A la gorra';
	return '';
}

/**
 * El subtítulo que sale de la descripción de la serie: su primera oración, sin la sintaxis de los
 * enlaces (`[[etiqueta]]`, `[[etiqueta|texto]]`), si es corta (entra en la píldora); si no, ''.
 * @param {unknown} description
 */
export function seriesSubtitle(description) {
	const text = trimmed(description)
		.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/[*_`#>]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	const first = text.split(/(?<=[.!?])\s/)[0].replace(/\.$/, '');
	return first.length <= SUBTITLE_MAX ? first : '';
}

/**
 * La fila de un evento con lo que sale de sus datos.
 * @param {FlyerEvent} event
 * @param {{ now?: number }} [opts]
 * @returns {FlyerRow}
 */
export function flyerRow(event, { now = Date.now() } = {}) {
	return {
		slug: event.slug,
		title: trimmed(event.title),
		date: flyerDateLine(event.start),
		icon: trimmed(event.series?.icon) || FALLBACK_ICON,
		subtitle: seriesSubtitle(event.series?.description),
		place: shortenCity(flyerPlaceText({ ...event.meta, tags: event.tags }, event.venue)),
		price: flyerPriceText(event.types, event.tags, now)
	};
}

/**
 * La fila con lo que se cambió a mano en la página: un campo cambiado manda aunque quede vacío
 * (así se puede sacar una línea); `undefined` deja el de los datos.
 * @param {FlyerRow} row
 * @param {FlyerOverrides | null | undefined} overrides
 * @returns {FlyerRow}
 */
export function withOverrides(row, overrides) {
	if (!overrides) return row;
	/** @type {FlyerRow} */
	const out = { ...row };
	for (const key of /** @type {const} */ (['icon', 'subtitle', 'place', 'price'])) {
		const v = overrides[key];
		if (typeof v === 'string') out[key] = v.trim();
	}
	if (!out.icon) out.icon = FALLBACK_ICON;
	return out;
}

/**
 * El rango de días que se pide (`?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`): por defecto, hoy y los
 * próximos {@link DEFAULT_RANGE_DAYS} días; nunca al revés ni más largo que
 * {@link MAX_RANGE_DAYS}.
 * @param {URLSearchParams} params
 * @param {number} [now]
 * @returns {{ from: string, to: string }}
 */
export function parseRange(params, now = Date.now()) {
	const day = (/** @type {string | null} */ v) =>
		v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : '';
	const today = argDate(now);
	const from = day(params.get('desde')) || today;
	const plus = (/** @type {string} */ d, /** @type {number} */ n) =>
		new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
	let to = day(params.get('hasta')) || plus(from, DEFAULT_RANGE_DAYS - 1);
	if (to < from) to = from;
	const max = plus(from, MAX_RANGE_DAYS - 1);
	if (to > max) to = max;
	return { from, to };
}

/**
 * ¿El evento empieza (en hora de Argentina) entre `from` y `to`, los dos incluidos?
 * @param {string | number | Date} start
 * @param {{ from: string, to: string }} range
 */
export function inRange(start, { from, to }) {
	const d = argDate(start);
	return !d.startsWith('NaN') && d >= from && d <= to;
}

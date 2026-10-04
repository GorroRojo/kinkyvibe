// Events and posts are dated in Argentina time (UTC-3, no DST), but pages are
// rendered on the server in UTC and in browsers in whatever timezone the viewer
// has. These helpers make displayed dates independent of the runtime timezone.

export const TIMEZONE = 'America/Argentina/Buenos_Aires';
const OFFSET_MS = -3 * 60 * 60 * 1000;

/**
 * Returns a Date whose *local* fields (getDate, getHours..., and so what
 * date-fns `format` prints) are the wall-clock time in Argentina at `d`.
 * Only use it for display/grouping, not for comparing instants.
 * @param {string|number|Date} d
 * @returns {Date}
 */
export function toArgentina(d) {
	const shifted = new Date(new Date(d).getTime() + OFFSET_MS);
	return new Date(
		shifted.getUTCFullYear(),
		shifted.getUTCMonth(),
		shifted.getUTCDate(),
		shifted.getUTCHours(),
		shifted.getUTCMinutes(),
		shifted.getUTCSeconds()
	);
}

/**
 * `Intl.DateTimeFormat` in es-AR with a **24-hour clock**, in Argentina time unless `options`
 * says otherwise. Use it instead of a bare `new Intl.DateTimeFormat('es-AR', …)` or
 * `toLocaleString('es-AR', …)` whenever the output has an hour: recent ICU/CLDR data gives es-AR
 * a 12-hour clock (`10:00 p. m.`), and the site always shows times as `22:00`.
 *
 * `hour12` is dropped because it would override `hourCycle`.
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {Intl.DateTimeFormat}
 */
export function argFormat(options = {}) {
	const rest = { ...options };
	delete rest.hour12;
	return new Intl.DateTimeFormat('es-AR', { timeZone: TIMEZONE, ...rest, hourCycle: 'h23' });
}

/**
 * The end of an event as a Date. Falls back to the start if there's no valid
 * end, and fixes the common mistake of an end past midnight written with the
 * start's date (e.g. 20:00 -> 01:30 on the same day) by moving it a day later.
 * @param {string|Date} start
 * @param {string|Date|undefined} end
 * @returns {Date}
 */
export function eventEnd(start, end) {
	const s = new Date(start);
	const e = new Date(end ?? start);
	if (isNaN(e.getTime())) return s;
	if (e.getTime() < s.getTime() && toArgentina(e).toDateString() == toArgentina(s).toDateString()) {
		return new Date(e.getTime() + 24 * 60 * 60 * 1000);
	}
	return e;
}

// Small formatters for list/card views, so those pages don't pull in date-fns.
// They print the Argentina wall-clock time whatever the runtime timezone is.

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, '0');
const WEEKDAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_ES = [
	'enero',
	'febrero',
	'marzo',
	'abril',
	'mayo',
	'junio',
	'julio',
	'agosto',
	'septiembre',
	'octubre',
	'noviembre',
	'diciembre'
];

/**
 * `yyyy-MM-dd` in Argentina time.
 * @param {string|number|Date} d
 */
export function argDate(d) {
	const a = toArgentina(d);
	return `${a.getFullYear()}-${pad2(a.getMonth() + 1)}-${pad2(a.getDate())}`;
}

/**
 * `HH:mm` (24h) in Argentina time.
 * @param {string|number|Date} d
 */
export function argTime(d) {
	const a = toArgentina(d);
	return `${pad2(a.getHours())}:${pad2(a.getMinutes())}`;
}

/**
 * Spanish weekday and zero-padded day of the month in Argentina time, e.g. `lunes 05`
 * (what date-fns `format(d, 'EEEE dd', { locale: es })` printed).
 * @param {string|number|Date} d
 */
export function argWeekdayDay(d) {
	const a = toArgentina(d);
	return `${WEEKDAYS_ES[a.getDay()]} ${pad2(a.getDate())}`;
}

/** Weekday and month abbreviations for lists ("vie 2 oct"). */
const WEEKDAYS_SHORT_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS_SHORT_ES = MONTHS_ES.map((m) => m.slice(0, 3));

/**
 * Formatos de fecha visibles (decisión de gorrite, revisión de UI paso 3). Nunca fechas ISO ni
 * «hs» en lo que se ve:
 * - listas: {@link argDateList} → `vie 2 oct · 22:00` (con el año si no es el actual);
 * - encabezados: {@link argDateTimeLong} → `viernes 2 de octubre de 2026, 22:00`;
 * - registros: «hace X» (`fmtRelative` del panel) o {@link argDateLog} → `2/10/26 13:43`.
 */

/**
 * Date for lists, in Argentina time: `vie 2 oct · 22:00`. Without the time if `time` is false
 * (`vie 2 oct`). The year goes at the end (`vie 2 oct 2025`) when it isn't the year of `now`.
 * @param {string|number|Date} d
 * @param {{ time?: boolean, now?: string|number|Date }} [opts]
 */
export function argDateList(d, { time = true, now = Date.now() } = {}) {
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return '';
	const year = a.getFullYear() === toArgentina(now).getFullYear() ? '' : ` ${a.getFullYear()}`;
	const day = `${WEEKDAYS_SHORT_ES[a.getDay()]} ${a.getDate()} ${MONTHS_SHORT_ES[a.getMonth()]}${year}`;
	return time ? `${day} · ${pad2(a.getHours())}:${pad2(a.getMinutes())}` : day;
}

/**
 * Date for logs and tables, in Argentina time: `2/10/26 13:43` (`2/10/26` without the time).
 * @param {string|number|Date} d
 * @param {{ time?: boolean }} [opts]
 */
export function argDateLog(d, { time = true } = {}) {
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return '';
	const day = `${a.getDate()}/${a.getMonth() + 1}/${pad2(a.getFullYear() % 100)}`;
	return time ? `${day} ${pad2(a.getHours())}:${pad2(a.getMinutes())}` : day;
}

/**
 * Long date for headers, in Argentina time: `viernes 2 de octubre de 2026, 22:00` (the event
 * page, the mails). Without the time if `time` is false (`viernes 2 de octubre de 2026`).
 *
 * Built by hand instead of with `toLocaleString('es-AR', { timeStyle: 'short' })`: recent ICU/CLDR
 * data gives es-AR a 12-hour clock (`3:00 p. m.`).
 * @param {string|number|Date} d
 * @param {{ time?: boolean }} [opts]
 */
export function argDateTimeLong(d, { time = true } = {}) {
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return '';
	const day = `${WEEKDAYS_ES[a.getDay()]} ${a.getDate()} de ${MONTHS_ES[a.getMonth()]} de ${a.getFullYear()}`;
	return time ? `${day}, ${pad2(a.getHours())}:${pad2(a.getMinutes())}` : day;
}

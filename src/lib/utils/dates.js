// Events and posts are dated in Argentina time (UTC-3, no DST), but pages are
// rendered on the server in UTC and in browsers in whatever timezone the viewer
// has. These helpers make displayed dates independent of the runtime timezone.

export const TIMEZONE = 'America/Argentina/Buenos_Aires';

/**
 * Argentina está siempre en UTC−3 (sin horario de verano desde 2009): **hora de Argentina = UTC +
 * esto** (un número negativo). Es el único lugar con el desfasaje: para contar días o meses de
 * Argentina usá las funciones de abajo (`arClock`, `arDayKey`, `arMidnight`, `arMonthWindow`) en
 * vez de otra constante con `3 * 60 * 60 * 1000` (las copias tenían signos distintos).
 */
export const AR_UTC_OFFSET_MS = -3 * 60 * 60 * 1000;
const OFFSET_MS = AR_UTC_OFFSET_MS;

/**
 * El instante `ms` corrido a la hora de Argentina, para leerlo con `getUTC…` o `toISOString()`
 * (`arClock(ms).getUTCDate()` es el día en Argentina). No es un instante real: no lo compares.
 * @param {number} ms
 * @returns {Date}
 */
export const arClock = (ms) => new Date(ms + AR_UTC_OFFSET_MS);

/**
 * El día de Argentina (`YYYY-MM-DD`) de un instante.
 * @param {number} ms
 * @returns {string}
 */
export const arDayKey = (ms) => arClock(ms).toISOString().slice(0, 10);

/**
 * El instante de las 00:00 de Argentina del día `d` del mes `m0` (0 = enero) de `y`. Como
 * `Date.UTC`, se desborda: `arMidnight(2026, 12, 1)` es el 1/1/2027 y `arMidnight(y, m0, 0)` el
 * último día del mes anterior.
 * @param {number} y
 * @param {number} m0
 * @param {number} d
 * @returns {number}
 */
export const arMidnight = (y, m0, d) => Date.UTC(y, m0, d) - AR_UTC_OFFSET_MS;

/**
 * El mes `m0` (0 = enero) de `y` en Argentina como ventana `[start, end)` en ms: desde las 00:00
 * del día 1 hasta las 00:00 del día 1 del mes siguiente (exclusivo).
 * @param {number} y
 * @param {number} m0
 * @returns {{ start: number, end: number }}
 */
export const arMonthWindow = (y, m0) => ({
	start: arMidnight(y, m0, 1),
	end: arMidnight(y, m0 + 1, 1)
});

/**
 * Returns a Date whose *local* fields (getDate, getHours..., and so what
 * date-fns `format` prints) are the wall-clock time in Argentina at `d`.
 * Only use it for display/grouping, not for comparing instants.
 * @param {string|number|Date} d
 * @returns {Date}
 */
export function toArgentina(d) {
	const shifted = new Date(parseSiteDate(d).getTime() + OFFSET_MS);
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
	const s = parseSiteDate(start);
	const e = parseSiteDate(end ?? start);
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
/** Weekday names, Sunday first (`Date#getDay`). */
export const WEEKDAYS_ES = [
	'domingo',
	'lunes',
	'martes',
	'miércoles',
	'jueves',
	'viernes',
	'sábado'
];
/** Month names, January first. */
export const MONTHS_ES = [
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

/**
 * Weekday and month abbreviations for lists ("vie 2 oct"). Always three letters: «sep», never
 * the «sept» that recent ICU data gives es-AR (`Intl` with `month: 'short'`).
 */
export const WEEKDAYS_SHORT_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MONTHS_SHORT_ES = MONTHS_ES.map((m) => m.slice(0, 3));

/**
 * Formatos de fecha visibles (decisión de gorrite, revisión de UI paso 3). Nunca fechas ISO ni
 * «hs» en lo que se ve:
 * - listas: {@link argDateList} → `vie 2 oct · 22:00` (con el año si no es el actual);
 * - encabezados: {@link argDateTimeLong} → `viernes 2 de octubre de 2026, 22:00`;
 * - registros: «hace X» (`fmtRelative` del panel) o {@link argDateLog} → `2/10/26 13:43`.
 *
 * Variantes para lo que no es una lista ni un encabezado:
 * - fecha corta con año: {@link argDateShort} → `2 oct 2026`;
 * - fecha larga sin día de la semana: {@link argDateLong} → `2 de octubre de 2026`;
 * - un vencimiento en una frase: {@link argDeadline} → `miércoles 15 de octubre a las 20:00`;
 * - día y mes en números: {@link argDayMonth} → `2/10`;
 * - solo la hora: {@link argTime} → `22:00`;
 * - las partes sueltas (bloques de fecha, imágenes): {@link argDateParts};
 * - una fecha de evento tal como está escrita (`2026-10-02T22:00-03:00` o solo `2026-10-02`):
 *   {@link eventDateList};
 * - planillas (CSV): {@link argDateTimeCsv} → `2026-10-02 22:30`.
 */

/**
 * The pieces of a date in Argentina time, for layouts that place them apart (a date block, an
 * image): `{ weekday: 'vie', day: 2, month: 'oct', year: 2026, hours: 22, minutes: 0 }`. `null`
 * if the date can't be read.
 * @param {string|number|Date} d
 */
export function argDateParts(d) {
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return null;
	return {
		weekday: WEEKDAYS_SHORT_ES[a.getDay()],
		weekdayLong: WEEKDAYS_ES[a.getDay()],
		day: a.getDate(),
		month: MONTHS_SHORT_ES[a.getMonth()],
		monthLong: MONTHS_ES[a.getMonth()],
		year: a.getFullYear(),
		hours: a.getHours(),
		minutes: a.getMinutes()
	};
}

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

/**
 * A deadline in a sentence, in Argentina time: `miércoles 15 de octubre a las 20:00` (for
 * «te guardamos el lugar hasta el …»). No year: these deadlines are a few days away.
 * `''` for a missing or unreadable date.
 * @param {string|number|Date|null|undefined} d
 */
export function argDeadline(d) {
	if (d == null || d === '') return '';
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return '';
	return `${WEEKDAYS_ES[a.getDay()]} ${a.getDate()} de ${MONTHS_ES[a.getMonth()]} a las ${pad2(a.getHours())}:${pad2(a.getMinutes())}`;
}

/**
 * Short date with the year, in Argentina time: `2 oct 2026`.
 *
 * Like the other helpers below it, it gives `''` for a missing (`null`, `''`) or unreadable date.
 * @param {string|number|Date|null|undefined} d
 */
export function argDateShort(d) {
	if (d == null || d === '') return '';
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return '';
	return `${a.getDate()} ${MONTHS_SHORT_ES[a.getMonth()]} ${a.getFullYear()}`;
}

/**
 * Long date without the weekday, in Argentina time: `2 de octubre de 2026` (`2 de octubre` if
 * `year` is false).
 * @param {string|number|Date|null|undefined} d
 * @param {{ year?: boolean }} [opts]
 */
export function argDateLong(d, { year = true } = {}) {
	if (d == null || d === '') return '';
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return '';
	const day = `${a.getDate()} de ${MONTHS_ES[a.getMonth()]}`;
	return year ? `${day} de ${a.getFullYear()}` : day;
}

/**
 * Day and month in numbers, in Argentina time: `2/10`.
 * @param {string|number|Date|null|undefined} d
 */
export function argDayMonth(d) {
	if (d == null || d === '') return '';
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return '';
	return `${a.getDate()}/${a.getMonth() + 1}`;
}

/**
 * Date and time for spreadsheets (CSV exports), in Argentina time: `2026-10-02 22:30`. Sorts as
 * text and every spreadsheet reads it as a date. `''` if the date can't be read.
 * @param {string|number|Date|null|undefined} d
 */
export function argDateTimeCsv(d) {
	if (d == null || d === '') return '';
	const a = toArgentina(d);
	if (isNaN(a.getTime())) return '';
	return `${argDate(d)} ${argTime(d)}`;
}

/**
 * {@link argDateList} for an event date as the site writes it (`2026-10-02T22:00-03:00`): the
 * time as written (it is already Argentina time), and only the day (`vie 2 oct`) when the date
 * has no time (`2026-10-02`). A `Date` (some YAML parsers give one) is read in Argentina time.
 * The year goes at the end when it isn't the year of `now`; without `now` it never goes.
 * `''` if the date can't be read.
 * @param {string|Date|null|undefined} start
 * @param {{ now?: string|number|Date }} [opts]
 */
export function eventDateList(start, { now } = {}) {
	if (start instanceof Date) return argDateList(start, { now: now ?? start });
	const m = String(start ?? '')
		.trim()
		.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
	if (!m) return '';
	const hh = (m[2] ?? '12').padStart(2, '0');
	const iso = `${m[1]}T${hh}:${m[3] ?? '00'}:00-03:00`;
	return argDateList(iso, { time: Boolean(m[2]), now: now ?? iso });
}

// Machine-readable dates (`<time datetime>`, Open Graph `article:*_time`, JSON-LD). The site stores
// publication dates as `2024-12-06Z-03:00` (date, a stray `Z` and the offset), which is **not**
// ISO 8601: printed as-is it gave `article:published_time="2024-12-06Z-03:00"`, and not every JS
// engine parses it. These helpers turn any site date into valid ISO 8601.

/** A full ISO 8601 date-time with a zone, as these helpers and the site's event dates write it. */
const ISO_DATETIME_RE =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
/**
 * Every shape a site date is stored in, read field by field so no string ever reaches
 * `Date.parse` (whose leniency outside the ES date-time format is engine-specific: V8 reads
 * `2024-12-06Z-03:00`, JavaScriptCore doesn't):
 * - publication dates: `2024-12-06Z-03:00` (date, a stray `Z` and the offset), also
 *   `2024-12-06-03:00`, `2024-12-06Z` and a bare `2024-12-06`;
 * - event dates: `2026-10-02T22:00-03:00`, with or without seconds (`:00`, `:00.000`), a space
 *   instead of the `T`, a one-digit hour, a `Z` or a `-0300` offset, or no offset at all.
 * Groups: year, month, day, hours, minutes, seconds, fraction, zone.
 */
const SITE_DATE_RE =
	/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(?:Z(?=[+-]))?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Minutes east of UTC for a zone as `SITE_DATE_RE` captures it (`Z`, `-03:00`, `-0300`, `-03`).
 * @param {string} zone
 */
function zoneMinutes(zone) {
	if (zone === 'Z') return 0;
	const sign = zone[0] === '-' ? -1 : 1;
	const digits = zone.slice(1).replace(':', '');
	return sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || 0));
}

/**
 * Reads a site date (`2024-12-06Z-03:00`, `2026-10-02T22:00-03:00`, a bare `2026-10-02`, a
 * timestamp or a `Date`) as a `Date`, the same in every JS engine: the stored shapes (see
 * `SITE_DATE_RE`) are read field by field, never with `Date.parse`. A date without a time is
 * midnight at its offset; a date or date-time without an offset (or a date with only the stray
 * `Z`) is Argentina time, like everything the site writes. Anything else (an ISO string from
 * another source, say) goes to `new Date()`. Invalid `Date` if it can't be read.
 * @param {unknown} d
 * @returns {Date}
 */
export function parseSiteDate(d) {
	if (d instanceof Date) return new Date(d.getTime());
	if (typeof d === 'number') return new Date(d);
	const s = String(d ?? '').trim();
	const m = s.match(SITE_DATE_RE);
	if (!m) return new Date(s ? s : NaN);
	const [, y, mo, day, h = '0', mi = '0', sec = '0', frac = '', zone] = m;
	const [year, month, date, hours, minutes, seconds] = [y, mo, day, h, mi, sec].map(Number);
	const ms = Number(frac.slice(0, 3).padEnd(3, '0'));
	// A lone `Z` on a date without a time is the stray `Z` of `2024-12-06Z-03:00`: Argentina.
	const offset = zone && !(zone === 'Z' && m[4] === undefined) ? zoneMinutes(zone) : -180;
	const utc = Date.UTC(year, month - 1, date, hours, minutes, seconds, ms);
	const check = new Date(utc);
	// Rejects 2026-02-30, 25:00 and the like instead of rolling them over.
	if (
		check.getUTCFullYear() !== year ||
		check.getUTCMonth() !== month - 1 ||
		check.getUTCDate() !== date ||
		check.getUTCHours() !== hours ||
		check.getUTCMinutes() !== minutes ||
		check.getUTCSeconds() !== seconds
	)
		return new Date(NaN);
	return new Date(utc - offset * 60 * 1000);
}

/**
 * A valid ISO 8601 date-time with a zone, for Open Graph (`article:published_time`) and
 * schema.org: `2024-12-06Z-03:00` → `2024-12-06T00:00:00-03:00`. A string that already is one
 * (`2026-10-02T22:00-03:00`) is kept as written; anything else is written in Argentina time
 * (`2026-10-02T22:00:00-03:00`). `undefined` if it can't be read.
 * @param {unknown} d
 * @returns {string | undefined}
 */
export function isoDateTime(d) {
	if (typeof d === 'string' && ISO_DATETIME_RE.test(d.trim())) return d.trim();
	const date = parseSiteDate(d);
	if (isNaN(date.getTime())) return undefined;
	return `${argDate(date)}T${argTime(date)}:${pad2(toArgentina(date).getSeconds())}-03:00`;
}

/**
 * A valid ISO 8601 calendar date in Argentina time, for a `<time datetime>` that only means a day
 * (a publication date): `2024-12-06Z-03:00` → `2024-12-06`. `undefined` if it can't be read.
 * @param {unknown} d
 * @returns {string | undefined}
 */
export function isoDay(d) {
	const date = parseSiteDate(d);
	return isNaN(date.getTime()) ? undefined : argDate(date);
}

/**
 * «Próximo»: ¿empieza después de `now`? La misma regla en todo el sitio (listas, calendario, bot,
 * tarjetas de entradas, avisos): una fecha que falta o no se puede leer no es próxima.
 * @param {string|number|Date|null|undefined} start
 * @param {number} [now]
 */
export function startsAfter(start, now = Date.now()) {
	return parseSiteDate(/** @type {any} */ (start)).getTime() > now;
}

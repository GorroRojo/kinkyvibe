/**
 * Períodos de Estadísticas (`/admin/estadisticas/ventas`, `/asistencia` y `/visitas`): qué
 * opciones tiene cada pestaña, cuál va por defecto y qué fechas cubre cada una. El período va en la
 * URL (`?periodo=12m`), así un link se puede compartir y el `load` del servidor lo lee. Puras, sin
 * DOM: las usan los `load` y el selector (`PeriodFilter.svelte`).
 *
 * Decisión de gorrite (11/10): Ventas y Asistencia arrancan en 12 meses (30 días / 90 días /
 * 12 meses / Todo); Visitas al sitio en 30 días (7 / 30 / 90: Analytics Engine guarda el detalle
 * unos 3 meses, más atrás solo quedan los totales por mes de `analytics_monthly`).
 */

/** Parámetro de la URL con el período. */
export const PERIOD_PARAM = 'periodo';
/** Parámetro de la URL con la serie (solo Ventas). */
export const SERIE_PARAM = 'serie';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Un período: `days` o `months` hacia atrás desde ahora; sin ninguno de los dos, «todo».
 * @typedef {{ id: string, label: string, days?: number, months?: number }} Period
 */

/** Ventas y Asistencia. @type {readonly Period[]} */
export const SALES_PERIODS = Object.freeze([
	{ id: '30d', label: '30 días', days: 30 },
	{ id: '90d', label: '90 días', days: 90 },
	{ id: '12m', label: '12 meses', months: 12 },
	{ id: 'todo', label: 'Todo' }
]);
export const SALES_DEFAULT_PERIOD = '12m';

/** Visitas al sitio. @type {readonly Period[]} */
export const VISITS_PERIODS = Object.freeze([
	{ id: '7d', label: '7 días', days: 7 },
	{ id: '30d', label: '30 días', days: 30 },
	{ id: '90d', label: '90 días', days: 90 }
]);
export const VISITS_DEFAULT_PERIOD = '30d';
/** Días que Analytics Engine guarda el detalle (más o menos): el período más largo de Visitas. */
export const VISITS_MAX_DAYS = 90;

/**
 * El período de un valor de la URL; si no es una opción válida (o falta), el de por defecto.
 * @param {string | null | undefined} raw
 * @param {readonly Period[]} periods
 * @param {string} fallbackId
 * @returns {Period}
 */
export function parsePeriod(raw, periods, fallbackId) {
	const hit = periods.find((p) => p.id === raw);
	if (hit) return hit;
	const fallback = periods.find((p) => p.id === fallbackId);
	if (!fallback) throw new Error(`período por defecto inválido: ${fallbackId}`);
	return fallback;
}

/**
 * El período de una URL (`?periodo=`).
 * @param {URL} url
 * @param {readonly Period[]} periods
 * @param {string} fallbackId
 */
export function periodFromUrl(url, periods, fallbackId) {
	return parsePeriod(url.searchParams.get(PERIOD_PARAM), periods, fallbackId);
}

/**
 * `ms` corrido `n` meses (en UTC; el día que no existe pasa al mes siguiente, como Date).
 * @param {number} ms
 * @param {number} n
 */
function shiftMonths(ms, n) {
	const d = new Date(ms);
	d.setUTCMonth(d.getUTCMonth() + n);
	return d.getTime();
}

/**
 * Las fechas de un período, en ms: `[from, to)` y el período anterior del mismo largo
 * `[prevFrom, prevTo)`, para comparar. Con «todo», `from` y `prevFrom` son `null` (sin anterior).
 * @param {Period} period
 * @param {number} now
 * @returns {{ from: number | null, to: number, prevFrom: number | null, prevTo: number | null }}
 */
export function periodRange(period, now) {
	if (period.days) {
		const from = now - period.days * DAY_MS;
		return { from, to: now, prevFrom: from - period.days * DAY_MS, prevTo: from };
	}
	if (period.months) {
		const from = shiftMonths(now, -period.months);
		return { from, to: now, prevFrom: shiftMonths(now, -2 * period.months), prevTo: from };
	}
	return { from: null, to: now, prevFrom: null, prevTo: null };
}

/**
 * Cómo se dice el período abajo de un número: «últimos 30 días», «desde el principio».
 * @param {Period} period
 */
export function periodText(period) {
	if (period.days) return `últimos ${period.days} días`;
	if (period.months) return `últimos ${period.months} meses`;
	return 'desde el principio';
}

/**
 * Cómo se dice el período anterior: «los 30 días anteriores». `''` para «todo».
 * @param {Period} period
 */
export function previousText(period) {
	if (period.days) return `los ${period.days} días anteriores`;
	if (period.months) return `los ${period.months} meses anteriores`;
	return '';
}

/**
 * Cambio relativo de `prev` a `cur` (0.25 = 25 % más), o `null` si no hay con qué comparar.
 * @param {number} cur
 * @param {number | null | undefined} prev
 */
export function relativeChange(cur, prev) {
	if (prev === null || prev === undefined || !Number.isFinite(prev) || prev === 0) return null;
	return (cur - prev) / prev;
}

/**
 * «▲ 25 % vs. los 30 días anteriores», «= vs. …» o `''` si no hay con qué comparar.
 * @param {number} cur
 * @param {number | null | undefined} prev
 * @param {Period} period
 */
export function changeText(cur, prev, period) {
	const rel = relativeChange(cur, prev);
	const against = previousText(period);
	if (rel === null || !against) return '';
	const pct = Math.round(Math.abs(rel) * 100);
	if (pct === 0) return `= vs. ${against}`;
	return `${rel > 0 ? '▲' : '▼'} ${pct} % vs. ${against}`;
}

/**
 * El link a la misma página con otros filtros. Los valores vacíos se sacan de la URL.
 * @param {string} pathname
 * @param {Record<string, string | null | undefined>} params
 */
export function filterHref(pathname, params) {
	const q = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
	const s = q.toString();
	return s ? `${pathname}?${s}` : pathname;
}

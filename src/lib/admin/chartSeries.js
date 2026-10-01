/**
 * Arma las series de los gráficos de Estadísticas en el navegador (y en el servidor, para el
 * primer render): agrupar las ventas por día, semana o mes, general o de un evento, y las escalas
 * de los ejes. Puras, sin DOM; se prueban solas.
 *
 * Los días son enteros (días desde 1970 en hora de Argentina, `dayNumber` de salesChart.js).
 */
import { dayDate, dayShort } from './salesChart.js';

/** @typedef {{ day: number, slug: string, tickets: number, revenue: number }} SalesDay */
/** @typedef {'day' | 'week' | 'month'} Bucket */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cuántos períodos se muestran en el gráfico general (el de un evento va completo). */
export const OVERALL_SPAN = Object.freeze({ day: 60, week: 26, month: 12 });

/**
 * Lunes de la semana de un día (el 1/1/1970 fue jueves).
 * @param {number} day
 */
export function weekStart(day) {
	return day - ((((day + 3) % 7) + 7) % 7);
}

/**
 * Primer día del mes de un día, corrido `add` meses.
 * @param {number} day
 * @param {number} [add]
 */
export function monthStart(day, add = 0) {
	const d = new Date(day * DAY_MS);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1) / DAY_MS;
}

/** @param {number} day "sep 26" */
function monthText(day) {
	const d = new Date(day * DAY_MS);
	const name = d.toLocaleDateString('es-AR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
	return `${name} ${String(d.getUTCFullYear()).slice(2)}`;
}

/**
 * Cómo se arma cada período: a qué período cae un día (`key`, su primer día), el período
 * corrido `n` lugares (`shift`) y su etiqueta.
 * @type {Record<Bucket, { key: (d: number) => number, shift: (d: number, n: number) => number, label: (d: number) => string }>}
 */
const PERIODS = {
	day: { key: (d) => d, shift: (d, n) => d + n, label: (d) => dayShort(d, true) },
	week: { key: weekStart, shift: (d, n) => d + 7 * n, label: (d) => `sem. ${dayShort(d)}` },
	month: { key: (d) => monthStart(d), shift: (d, n) => monthStart(d, n), label: monthText }
};

/**
 * Ventas agrupadas por día, semana (que empieza el lunes) o mes, con los períodos sin ventas en 0.
 * - General (`slug` vacío): los últimos {@link OVERALL_SPAN} períodos hasta `today`.
 * - De un evento: desde su primera venta hasta la última.
 * @param {readonly SalesDay[]} days
 * @param {{ bucket: Bucket, slug?: string, today: number }} opts
 * @returns {Array<{ start: number, date: string, label: string, tickets: number, revenue: number }>}
 */
export function bucketSales(days, { bucket, slug = '', today }) {
	const rows = slug ? days.filter((d) => d.slug === slug) : days;
	const p = PERIODS[bucket];
	let from;
	let to;
	if (slug) {
		if (!rows.length) return [];
		from = p.key(Math.min(...rows.map((d) => d.day)));
		to = p.key(Math.max(...rows.map((d) => d.day)));
	} else {
		to = p.key(today);
		from = p.shift(to, -(OVERALL_SPAN[bucket] - 1));
	}
	/** @type {Map<number, { start: number, date: string, label: string, tickets: number, revenue: number }>} */
	const out = new Map();
	for (let d = from; d <= to; d = p.shift(d, 1)) {
		out.set(d, { start: d, date: dayDate(d), label: p.label(d), tickets: 0, revenue: 0 });
	}
	for (const r of rows) {
		const b = out.get(p.key(r.day));
		if (!b) continue;
		b.tickets += r.tickets;
		b.revenue += r.revenue;
	}
	return [...out.values()];
}

/**
 * Un número entero como se escribe acá ("1.234").
 * @param {number} v
 */
export const formatCount = (v) => Math.round(v).toLocaleString('es-AR');

/**
 * Marcas "redondas" del eje Y entre `min` (≤ 0) y `max`: pasos de 1, 2 o 5 × 10ⁿ, unos `count`
 * tramos.
 * @param {number} min
 * @param {number} max
 * @param {number} [count]
 * @returns {number[]}
 */
export function niceTicks(min, max, count = 4) {
	const lo = Math.min(0, min);
	const hi = Math.max(0, max);
	if (hi === lo) return [0, 1];
	const pow = 10 ** Math.floor(Math.log10((hi - lo) / count));
	/** @param {number} s cuántos tramos quedan con ese paso */
	const parts = (s) => Math.ceil(hi / s - 1e-9) - Math.floor(lo / s + 1e-9);
	// El paso redondo que deja la cantidad de tramos más parecida a `count` (empate: el mayor).
	const step = [1, 2, 5, 10, 20]
		.map((m) => m * pow)
		.reduce((best, s) => (Math.abs(parts(s) - count) <= Math.abs(parts(best) - count) ? s : best));
	const ticks = [];
	for (let v = Math.floor(lo / step) * step; v < hi + step; v += step) {
		ticks.push(Math.round(v * 1e6) / 1e6);
		if (v >= hi) break;
	}
	return ticks;
}

/**
 * Camino SVG de una barra de ancho `w` desde `yBase` (la base) hasta `yEnd`, con el extremo de
 * datos redondeado (radio `r`, menos si la barra es baja) y la base recta. Sirve para barras
 * negativas (yEnd debajo de la base). Vacío si no tiene alto.
 * @param {number} x
 * @param {number} yBase
 * @param {number} yEnd
 * @param {number} w
 * @param {number} [r]
 */
export function barPath(x, yBase, yEnd, w, r = 4) {
	const h = Math.abs(yBase - yEnd);
	if (h < 0.5 || w <= 0) return '';
	const k = Math.min(r, h, w / 2);
	const dir = yEnd < yBase ? -1 : 1; // -1: hacia arriba
	const f = (/** @type {number} */ n) => Math.round(n * 100) / 100;
	return [
		`M${f(x)},${f(yBase)}`,
		`V${f(yEnd - dir * k)}`,
		`Q${f(x)},${f(yEnd)} ${f(x + k)},${f(yEnd)}`,
		`H${f(x + w - k)}`,
		`Q${f(x + w)},${f(yEnd)} ${f(x + w)},${f(yEnd - dir * k)}`,
		`V${f(yBase)}Z`
	].join(' ');
}

/**
 * Cada cuántas columnas va una etiqueta del eje X para que no se pisen.
 * @param {number} n columnas
 * @param {number} width ancho del gráfico en px
 * @param {number} [minPx] lugar que necesita una etiqueta
 */
export function labelEvery(n, width, minPx = 56) {
	if (n <= 0 || width <= 0) return 1;
	return Math.max(1, Math.ceil(n / Math.max(1, Math.floor(width / minPx))));
}

/**
 * Formatos de fecha del panel, siempre en hora de Argentina.
 */
import { argDateList, argDateLog } from '$lib/utils/dates.js';

/**
 * Fecha para listas y tablas: "vie 2 oct" ("vie 2 oct 2025" si no es de este año). Acepta ms o
 * un texto de fecha del frontmatter. Ver los formatos en `$lib/utils/dates.js`.
 * @param {string | number | null | undefined} value
 */
export function fmtDate(value) {
	if (value === null || value === undefined || value === '') return '';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return String(value);
	return argDateList(d, { time: false });
}

/**
 * Fecha y hora de un registro: "2/10/26 13:43".
 * @param {string | number | null | undefined} value
 */
export function fmtDateTime(value) {
	if (value === null || value === undefined || value === '') return '';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return String(value);
	return argDateLog(d);
}

/**
 * Cuánto falta (o pasó) en palabras cortas: "en 3 h", "en 2 días", "hace 5 h".
 * @param {number} ms momento
 * @param {number} [now]
 */
export function fmtRelative(ms, now = Date.now()) {
	const diff = ms - now;
	const abs = Math.abs(diff);
	const h = abs / 3_600_000;
	const text =
		h < 1
			? `${Math.max(1, Math.round(abs / 60_000))} min`
			: h < 48
				? `${Math.round(h)} h`
				: `${Math.round(h / 24)} días`;
	return diff >= 0 ? `en ${text}` : `hace ${text}`;
}

/**
 * Formatos de fecha del panel, siempre en hora de Argentina.
 */
import { TIMEZONE as SITE_TIMEZONE } from '$lib/utils/dates.js';

/**
 * "10 oct 2026" (acepta ms o un texto de fecha del frontmatter).
 * @param {string | number | null | undefined} value
 */
export function fmtDate(value) {
	if (value === null || value === undefined || value === '') return '';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return String(value);
	return d.toLocaleDateString('es-AR', { dateStyle: 'medium', timeZone: SITE_TIMEZONE });
}

/**
 * "10/10/26 22:00".
 * @param {string | number | null | undefined} value
 */
export function fmtDateTime(value) {
	if (value === null || value === undefined || value === '') return '';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return String(value);
	return d.toLocaleString('es-AR', {
		dateStyle: 'short',
		timeStyle: 'short',
		hourCycle: 'h23',
		timeZone: SITE_TIMEZONE
	});
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

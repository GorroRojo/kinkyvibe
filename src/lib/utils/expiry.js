/**
 * «Vence en…» con la hora exacta (pedido de gorrite). Funciones puras, con el reloj como
 * parámetro para poder probarlas.
 *
 * - En un mail no sabemos la zona horaria de quien lo lee: va la hora de Argentina
 *   (`America/Argentina/Buenos_Aires`, el mismo horario que Uruguay) y se aclara
 *   ({@link expiresInText}).
 * - En una página, el servidor muestra la hora de Argentina y, ya en el navegador, la hora local
 *   de quien mira (`timeZone` sin definir = la del entorno). Ver ExpiryTime.svelte.
 */
import { TIMEZONE } from './dates.js';

/** La aclaración de la hora en los mails y en la página antes de cargar. */
export const ARGENTINA_TIME_NOTE = 'hora de Argentina y Uruguay';

/** @typedef {{ timeZone?: string }} ZoneOption */

/**
 * «10 minutos», «1 minuto», «48 horas», «1 hora»: hasta 2 horas en minutos, después en horas.
 *
 * @param {number} ms
 */
export function durationText(ms) {
	const minutes = Math.max(1, Math.round(ms / 60_000));
	if (minutes < 120) return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
	const hours = Math.round(minutes / 60);
	return `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
}

/**
 * Las partes de una fecha en una zona (o en la del entorno, sin `timeZone`).
 * @param {number} ms
 * @param {string | undefined} timeZone
 */
function parts(ms, timeZone) {
	const fmt = new Intl.DateTimeFormat('es-AR', {
		timeZone,
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		weekday: 'long',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	});
	/** @type {Record<string, string>} */
	const out = {};
	for (const p of fmt.formatToParts(new Date(ms))) out[p.type] = p.value;
	return out;
}

/**
 * «14:35» (24 h) en `timeZone`, o en la zona del entorno si no se pasa.
 *
 * @param {number} ms
 * @param {ZoneOption} [opts]
 */
export function clockTime(ms, { timeZone } = {}) {
	const p = parts(ms, timeZone);
	return `${p.hour}:${p.minute}`;
}

/**
 * Cuándo vence, sin la palabra «vence»: «a las 14:35» si es el mismo día que `now` (en esa zona)
 * y, si no, «el sábado 3 de octubre a las 00:05». Con `until`, para «te guardamos el lugar…»:
 * «hasta las 14:35» o «hasta el sábado 3 de octubre a las 00:05».
 *
 * @param {number} expiresAt
 * @param {number} now
 * @param {ZoneOption & { until?: boolean }} [opts]
 */
export function expiryMoment(expiresAt, now, { timeZone, until = false } = {}) {
	const at = parts(expiresAt, timeZone);
	const today = parts(now, timeZone);
	const time = `${at.hour}:${at.minute}`;
	const sameDay = at.year === today.year && at.month === today.month && at.day === today.day;
	const day = `el ${at.weekday} ${at.day} de ${at.month} a las ${time}`;
	if (until) return sameDay ? `hasta las ${time}` : `hasta ${day}`;
	return sameDay ? `a las ${time}` : day;
}

/**
 * Lo que muestra una página (ExpiryTime.svelte): en el servidor (y sin JavaScript), la hora de
 * Argentina con la aclaración; ya en el navegador (`local`), la hora de quien mira, sin aclarar.
 *
 * @param {number} expiresAt
 * @param {number} now
 * @param {{ local: boolean, until?: boolean }} opts
 */
export function expiryLabel(expiresAt, now, { local, until = false }) {
	if (local) return expiryMoment(expiresAt, now, { until });
	return `${expiryMoment(expiresAt, now, { timeZone: TIMEZONE, until })}, ${ARGENTINA_TIME_NOTE}`;
}

/**
 * Para un mail: «Vence en 10 minutos (a las 14:35, hora de Argentina y Uruguay)».
 *
 * @param {number} expiresAt
 * @param {number} now
 * @param {{ lowercase?: boolean }} [opts] `lowercase`: «vence en…», para el medio de una frase
 */
export function expiresInText(expiresAt, now, { lowercase = false } = {}) {
	const when = expiryMoment(expiresAt, now, { timeZone: TIMEZONE });
	const text = `Vence en ${durationText(expiresAt - now)} (${when}, ${ARGENTINA_TIME_NOTE})`;
	return lowercase ? `v${text.slice(1)}` : text;
}

/**
 * Textos de «Dónde tenés la sesión abierta» en Mi rincón (docs/cuentas.md, «Sesiones»).
 */
import { argDate, argDateLong, toArgentina } from './dates.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La última vez que se usó una sesión, aproximada: `last_seen_at` se anota como mucho una vez por
 * día (session.js), así que alcanza con el día, en hora de Argentina: «hoy», «ayer» o «el 12 de
 * octubre» (con el año si no es el de `now`).
 *
 * @param {number} lastSeenAt ms desde epoch
 * @param {number} [now]
 */
export function lastSeenText(lastSeenAt, now = Date.now()) {
	const day = argDate(lastSeenAt);
	if (day >= argDate(now)) return 'hoy';
	if (day === argDate(now - DAY_MS)) return 'ayer';
	const sameYear = toArgentina(lastSeenAt).getFullYear() === toArgentina(now).getFullYear();
	return `el ${argDateLong(lastSeenAt, { year: !sameYear })}`;
}

/**
 * Cómo se entró, para «Entraste el … con …».
 *
 * @param {string} method
 */
export function loginMethodText(method) {
	if (method === 'password') return 'tu contraseña';
	if (method === 'passkey') return 'una passkey';
	return 'un código por mail';
}

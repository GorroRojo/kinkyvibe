/**
 * Horario de silencio de los avisos por Telegram (decisión 0029, fase 2): entre las 23 y las 9,
 * hora de Argentina, no sale nada. Lo pendiente sale en la primera corrida del cron desde las 9.
 */

const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Desde qué hora no se manda (incluida). */
export const QUIET_FROM_HOUR = 23;
/** Hasta qué hora no se manda (desde esta hora, sí). */
export const QUIET_UNTIL_HOUR = 9;

/**
 * La hora (0 a 23) en Argentina.
 *
 * @param {number} now milisegundos
 */
export function argentinaHour(now) {
	const hour = new Intl.DateTimeFormat('es-AR', {
		timeZone: TIME_ZONE,
		hour: 'numeric',
		hourCycle: 'h23'
	}).format(new Date(now));
	return Number(hour);
}

/**
 * ¿Es horario de silencio?
 *
 * @param {number} now milisegundos
 */
export function isQuietHour(now) {
	const hour = argentinaHour(now);
	return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

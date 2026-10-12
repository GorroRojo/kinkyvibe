/**
 * Cuánto dura la cookie de una sesión de las cuentas del público y qué sesiones ya no puede usar
 * nadie. Aparte de ./session.js porque también lo usa el cron nocturno
 * (src/lib/server/scheduled.js), que carga sin Vite: solo imports relativos (ninguno).
 *
 * Las sesiones duran hasta cerrar sesión (decisión P7.11): el servidor no las vence. Pero la
 * cookie dura {@link SESSION_COOKIE_MAX_AGE} desde la última vez que se mandó, y se vuelve a mandar
 * solo cuando se actualiza `last_seen_at`. Una sesión cuyo `last_seen_at` es más viejo que eso (con
 * un día de margen) ya no tiene cookie en ningún navegador: borrarla no cierra la sesión de nadie,
 * solo saca una fila que nunca más se va a usar.
 */

/** Lo más que aceptan los navegadores (Chrome topea en 400 días), en segundos. */
export const SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/** Margen para los relojes (del Worker y del navegador). */
const MARGIN_MS = 24 * 60 * 60 * 1000;

/** Una sesión sin uso desde hace más que esto ya no tiene cookie (ms). */
export const STALE_SESSION_MS = SESSION_COOKIE_MAX_AGE * 1000 + MARGIN_MS;

/**
 * Borra las sesiones que ya no tienen cookie en ningún navegador (ver arriba).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {number} [now]
 * @returns {Promise<number>} cuántas borró
 */
export async function deleteStaleSessions(db, now = Date.now()) {
	const result = await db
		.prepare('DELETE FROM account_sessions WHERE last_seen_at < ?1')
		.bind(now - STALE_SESSION_MS)
		.run();
	return Number(result.meta?.changes ?? 0);
}

/**
 * Decisiones puras del modo puerta cuando el servidor falla con la red andando (auditoría de
 * confiabilidad, OX1 y OX2). Archivo aparte de doorOffline.js a propósito: es chico y no se pisa
 * con los cambios de la pantalla de la puerta. Ver docs/tickets.md, «Sin conexión».
 */

/** Cuánto se espera la respuesta de un escaneo antes de validar con la lista guardada. */
export const CHECKIN_TIMEOUT_MS = 8000;

/** Con el servidor caído, cada cuánto un escaneo vuelve a probar con el servidor. */
export const SERVER_RETRY_MS = 30_000;

/**
 * Qué hacer cuando un escaneo no recibió una respuesta buena del servidor.
 *
 * - `'thrown'` (sin respuesta: tiempo agotado o error de red): si el navegador dice que no hay red,
 *   o no hay lista guardada, es «sin conexión» como siempre (`'offline'`); con red y lista,
 *   `'server-down'`.
 * - `'error'` (un 500) o `'redirect'` (la sesión se cerró): con lista guardada, `'server-down'`
 *   (valida con la lista y lo dice en un cartel); sin lista, `null` (los mensajes de siempre).
 *
 * @param {{ outcome: 'thrown' | 'error' | 'redirect', listLength: number, browserOnline: boolean }} input
 * @returns {'offline' | 'server-down' | null}
 */
export function scanFallback({ outcome, listLength, browserOnline }) {
	if (outcome === 'thrown') {
		return browserOnline && listLength > 0 ? 'server-down' : 'offline';
	}
	return listLength > 0 ? 'server-down' : null;
}

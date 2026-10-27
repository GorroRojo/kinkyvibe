/**
 * Decisiones puras del modo puerta cuando el servidor falla con la red andando y para sincronizar
 * colas largas (auditoría de confiabilidad, OX1 y OX2). Archivo aparte de doorOffline.js a propósito: es chico y no se pisa
 * con los cambios de la pantalla de la puerta. Ver docs/tickets.md, «Sin conexión».
 */

/** Cuánto se espera la respuesta de un escaneo antes de validar con la lista guardada. */
export const CHECKIN_TIMEOUT_MS = 8000;

/** Con el servidor caído, cada cuánto un escaneo vuelve a probar con el servidor. */
export const SERVER_RETRY_MS = 30_000;

/** Ingresos por envío al sincronizar (el servidor rechaza más de 500: QUEUE_MAX_ITEMS). */
export const SYNC_BATCH = 500;

/** Ventas por envío al sincronizar (el servidor rechaza más de 100: SALE_QUEUE_MAX_ITEMS). */
export const SALES_BATCH = 100;

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

/**
 * Parte una lista en tandas de `size` como mucho, en orden (auditoría de confiabilidad, OX2: una
 * cola de más de 500 ingresos el servidor la rechazaba entera y no se sincronizaba nunca).
 *
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
export function inBatches(items, size) {
	/** @type {T[][]} */
	const out = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

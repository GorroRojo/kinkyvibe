/**
 * Código corto de las entradas (el que está al lado del QR). Vive acá (y no en
 * $lib/server/tickets/orders.js) porque el modo puerta también lo usa en el navegador para
 * validar sin conexión.
 */

/** Largo del código corto. */
export const TICKET_CODE_LENGTH = 6;

/**
 * Normaliza un código tipeado en la puerta: sin espacios ni guiones, en mayúsculas, sin el
 * prefijo opcional "KV", y O→0, I/L→1 (esas letras no se usan en los códigos: si alguien las
 * tipea, casi seguro quiso decir el número). `null` si no tiene la forma.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeTicketCode(raw) {
	if (typeof raw !== 'string') return null;
	let s = raw.toUpperCase().replace(/[\s\-_.]/g, '');
	if (s.length === TICKET_CODE_LENGTH + 2 && s.startsWith('KV')) s = s.slice(2);
	if (s.length !== TICKET_CODE_LENGTH) return null;
	s = s.replaceAll('O', '0').replaceAll('I', '1').replaceAll('L', '1');
	return /^[0-9A-Z]+$/.test(s) ? s : null;
}

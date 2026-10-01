/**
 * SHA-256 con Web Crypto (Workers, navegador y Node): para claves de rate limit, cachés y
 * comparaciones de secretos sin revelar su largo. No es para contraseñas.
 */
import { toHex } from '../utils/base64.js';

/**
 * SHA-256 de un texto (UTF-8), en hexadecimal (64 caracteres).
 *
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256Hex(text) {
	return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/**
 * Compara dos textos en tiempo constante respecto del contenido (el largo sí se nota: usarlo con
 * hashes o firmas del mismo largo, como dos `sha256Hex`).
 *
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqual(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

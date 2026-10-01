/**
 * Piezas de criptografía de las cuentas, solo con Web Crypto (andan igual en Workers, Node y el
 * navegador; nada de módulos nativos). Base64url está en $lib/utils/base64.js y la comparación de
 * textos en tiempo constante, en $lib/server/hash.js.
 */
import { toBase64url } from '$lib/utils/base64.js';

/**
 * `n` bytes al azar (CSPRNG).
 *
 * @param {number} n
 */
export function randomBytes(n) {
	return crypto.getRandomValues(new Uint8Array(n));
}

/** Token al azar de 32 bytes (256 bits) en base64url: para las cookies de sesión. */
export function randomToken() {
	return toBase64url(randomBytes(32));
}

/**
 * Código numérico de `digits` cifras, uniforme (sin sesgo de módulo: se descartan los valores
 * del final del rango de 32 bits que no completan una vuelta entera).
 *
 * @param {number} [digits]
 */
export function randomDigits(digits = 6) {
	const max = 10 ** digits;
	const limit = Math.floor(0x1_0000_0000 / max) * max;
	const buf = new Uint32Array(1);
	for (;;) {
		crypto.getRandomValues(buf);
		if (buf[0] < limit) return String(buf[0] % max).padStart(digits, '0');
	}
}

/**
 * Compara dos secuencias de bytes en tiempo constante respecto del contenido (el largo sí se
 * nota, pero acá siempre se comparan hashes del mismo largo).
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 */
export function timingSafeEqualBytes(a, b) {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

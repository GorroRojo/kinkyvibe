/**
 * Piezas de criptografía de las cuentas, solo con Web Crypto (andan igual en Workers, Node y el
 * navegador; nada de módulos nativos).
 */

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64url(bytes) {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} text
 * @returns {Uint8Array | null} `null` si no es base64url válido
 */
export function fromBase64url(text) {
	if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) return null;
	try {
		const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
		const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
		return Uint8Array.from(bin, (c) => c.charCodeAt(0));
	} catch {
		return null;
	}
}

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

/**
 * Lo mismo para textos (p. ej. dos hashes en hex).
 *
 * @param {string} a
 * @param {string} b
 */
export function timingSafeEqualText(a, b) {
	const enc = new TextEncoder();
	return timingSafeEqualBytes(enc.encode(a), enc.encode(b));
}

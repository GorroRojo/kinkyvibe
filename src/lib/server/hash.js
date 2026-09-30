/**
 * SHA-256 con Web Crypto (Workers, navegador y Node): para claves de rate limit, cachés y
 * comparaciones de secretos sin revelar su largo. No es para contraseñas.
 */

/**
 * SHA-256 de un texto (UTF-8), en hexadecimal (64 caracteres).
 *
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function sha256Hex(text) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

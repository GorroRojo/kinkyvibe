/**
 * Base64, UTF-8 and hex helpers that work the same in the browser, Node and Cloudflare Workers,
 * without the `buffer` package: btoa/atob for base64, TextEncoder/TextDecoder for UTF-8. Used for
 * the GitHub contents API (files travel as base64) and uploaded images.
 *
 * Standard base64 (RFC 4648: `+` and `/`, `=` padding), the same output as Node's
 * `Buffer.toString('base64')`.
 */

/**
 * Bytes per String.fromCharCode call. Passing a whole multi-MB image as arguments would blow the
 * call stack; 32 KiB stays well under every engine's argument limit.
 */
const CHUNK = 0x8000;

/**
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {Uint8Array}
 */
const asBytes = (input) => (input instanceof Uint8Array ? input : new Uint8Array(input));

/**
 * Encodes bytes (or a string, as UTF-8) to base64.
 * @param {Uint8Array | ArrayBuffer | string} input
 * @returns {string}
 */
export function toBase64(input) {
	const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : asBytes(input);
	/** @type {string[]} */
	const parts = [];
	for (let i = 0; i < bytes.length; i += CHUNK) {
		// A "binary string" (one char, code 0–255, per byte) is what btoa expects.
		parts.push(String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + CHUNK))));
	}
	return btoa(parts.join(''));
}

/**
 * Decodes base64 to bytes. Ignores whitespace and newlines (the GitHub contents API wraps its
 * base64 every 60 characters). Throws on characters that are not base64.
 * @param {string} str
 * @returns {Uint8Array}
 */
export function fromBase64(str) {
	const binary = atob(str.replace(/\s+/g, ''));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

/**
 * Encodes a string as UTF-8 and then base64 (what the GitHub contents API wants as `content`).
 * @param {string} text
 * @returns {string}
 */
export const utf8ToBase64 = (text) => toBase64(text);

/**
 * Decodes base64 and reads the bytes as UTF-8 (a text file from the GitHub contents API).
 * @param {string} str
 * @returns {string}
 */
export const base64ToUtf8 = (str) => new TextDecoder().decode(fromBase64(str));

/**
 * Lowercase hex of some bytes (for example a crypto.subtle digest).
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {string}
 */
export function toHex(input) {
	const bytes = asBytes(input);
	let out = '';
	for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
	return out;
}

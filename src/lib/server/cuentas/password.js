/**
 * Contraseñas (opcionales; la otra forma de ingresar es el código por mail).
 *
 * PBKDF2-HMAC-SHA256 con Web Crypto: anda en Workers sin módulos nativos (bcrypt/argon2 en
 * Workers necesitan WASM y se comen el límite de CPU).
 *
 * Parámetros y por qué:
 * - **100.000 iteraciones**: el máximo que acepta PBKDF2 en Cloudflare Workers (workerd rechaza
 *   más). OWASP recomienda 600.000 para PBKDF2-SHA256; como no se puede, se compensa con los
 *   límites de intentos por mail y por conexión (ver accounts.js), con que el mail por código
 *   sigue siendo la vía principal, y con el largo mínimo de la contraseña. El número va guardado
 *   en cada hash: si algún día Workers permite más, se suben y los hashes viejos se rehacen solos
 *   en el próximo ingreso (`needsRehash`).
 * - **Sal de 16 bytes al azar por contraseña** (NIST SP 800-132 pide al menos 128 bits).
 * - **Clave derivada de 32 bytes** (el tamaño de salida de SHA-256; más no suma seguridad).
 * - Formato: `pbkdf2-sha256$<iteraciones>$<sal base64url>$<hash base64url>`.
 */
import { fromBase64url, randomBytes, timingSafeEqualBytes, toBase64url } from './crypto.js';

export const PBKDF2_ITERATIONS = 100_000;
/** El máximo de iteraciones que acepta workerd; un test verifica que no lo pasemos. */
export const WORKERS_PBKDF2_MAX_ITERATIONS = 100_000;
export const SALT_BYTES = 16;
export const KEY_BYTES = 32;
const SCHEME = 'pbkdf2-sha256';

export const PASSWORD_MIN_LENGTH = 10;
/** Tope para no gastar CPU con textos enormes (HMAC igual comprime la clave, pero por las dudas). */
export const PASSWORD_MAX_LENGTH = 200;

/**
 * Valida una contraseña nueva. Devuelve el mensaje de error o `null`.
 *
 * @param {unknown} password
 */
export function passwordProblem(password) {
	if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH)
		return `La contraseña tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
	if (password.length > PASSWORD_MAX_LENGTH)
		return `La contraseña puede tener hasta ${PASSWORD_MAX_LENGTH} caracteres.`;
	if (!password.trim()) return 'La contraseña no puede ser solo espacios.';
	return null;
}

/**
 * @param {string} password
 * @param {Uint8Array} salt
 * @param {number} iterations
 */
async function derive(password, salt, iterations) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(password.normalize('NFC')),
		'PBKDF2',
		false,
		['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
		key,
		KEY_BYTES * 8
	);
	return new Uint8Array(bits);
}

/**
 * Hash para guardar en `accounts.password_hash`.
 *
 * @param {string} password
 * @param {{ iterations?: number }} [opts] (tests)
 */
export async function hashPassword(password, { iterations = PBKDF2_ITERATIONS } = {}) {
	const salt = randomBytes(SALT_BYTES);
	const hash = await derive(password, salt, iterations);
	return `${SCHEME}$${iterations}$${toBase64url(salt)}$${toBase64url(hash)}`;
}

/**
 * @param {string} stored
 * @returns {{ iterations: number, salt: Uint8Array, hash: Uint8Array } | null}
 */
function parse(stored) {
	const parts = typeof stored === 'string' ? stored.split('$') : [];
	if (parts.length !== 4 || parts[0] !== SCHEME) return null;
	const iterations = Number(parts[1]);
	if (!Number.isInteger(iterations) || iterations < 1 || iterations > WORKERS_PBKDF2_MAX_ITERATIONS)
		return null;
	const salt = fromBase64url(parts[2]);
	const hash = fromBase64url(parts[3]);
	if (!salt || !hash || salt.length < SALT_BYTES || hash.length !== KEY_BYTES) return null;
	return { iterations, salt, hash };
}

/**
 * ¿`password` corresponde a `stored`? Compara en tiempo constante. Un hash guardado inválido o
 * ausente da `false`, pero igual gasta el mismo tiempo (así no se nota si la cuenta tiene
 * contraseña o si existe).
 *
 * @param {string} password
 * @param {string | null | undefined} stored
 */
export async function verifyPassword(password, stored) {
	const parsed = stored ? parse(stored) : null;
	if (typeof password !== 'string' || password.length > PASSWORD_MAX_LENGTH || !parsed) {
		await derive('x', randomBytes(SALT_BYTES), PBKDF2_ITERATIONS);
		return false;
	}
	const candidate = await derive(password, parsed.salt, parsed.iterations);
	return timingSafeEqualBytes(candidate, parsed.hash);
}

/**
 * ¿Hay que rehacer el hash con los parámetros de ahora? (después de un ingreso correcto).
 *
 * @param {string} stored
 */
export function needsRehash(stored) {
	const parsed = parse(stored);
	return !parsed || parsed.iterations !== PBKDF2_ITERATIONS;
}

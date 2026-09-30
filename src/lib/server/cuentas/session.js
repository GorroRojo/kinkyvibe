/**
 * Sesiones de las cuentas del público (tabla `account_sessions`). Aparte de la sesión de admins
 * (cookie `userToken` de GitHub, ver src/lib/server/auth.js): una no toca a la otra.
 *
 * - Duran hasta que la persona cierra sesión (decisión P7.11): el servidor no las vence nunca.
 *   Los navegadores topean las cookies en unos 400 días, así que la cookie se vuelve a mandar
 *   (con 400 días más) cada vez que se actualiza `last_seen_at`: mientras la persona entre al
 *   sitio de vez en cuando, no se cae.
 * - La cookie lleva un token al azar de 256 bits; en la base solo está su SHA-256.
 * - Cookie httpOnly, Secure (salvo http://localhost) y SameSite=Lax.
 */
import { sha256Hex } from '$lib/server/hash.js';
import { randomToken } from './crypto.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {'code' | 'password' | 'passkey'} LoginMethod */

export const SESSION_COOKIE = 'kvRincon';
/** Lo más que aceptan los navegadores (Chrome topea en 400 días). */
export const SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
/** `last_seen_at` se actualiza como mucho una vez cada tanto, para no escribir en cada página. */
export const LAST_SEEN_EVERY_MS = 24 * 60 * 60 * 1000;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * Opciones de la cookie de sesión.
 *
 * @param {URL} url
 */
export function sessionCookieOptions(url) {
	return {
		path: '/',
		httpOnly: true,
		secure: !(url.hostname === 'localhost' && url.protocol === 'http:'),
		sameSite: /** @type {const} */ ('lax'),
		maxAge: SESSION_COOKIE_MAX_AGE
	};
}

/**
 * Crea una sesión y devuelve el token para la cookie (el único lugar donde existe en claro).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {LoginMethod} method
 * @param {{ now?: number }} [opts]
 */
export async function createSession(db, accountId, method, { now = Date.now() } = {}) {
	const token = randomToken();
	await db
		.prepare(
			`INSERT INTO account_sessions (token_hash, account_id, method, created_at, last_seen_at)
			VALUES (?1, ?2, ?3, ?4, ?4)`
		)
		.bind(await sha256Hex(token), accountId, method, now)
		.run();
	return token;
}

/**
 * La cuenta de la sesión de este token, o `null`. `touched` dice si se actualizó
 * `last_seen_at` (entonces hay que volver a mandar la cookie).
 *
 * @param {D1Database} db
 * @param {string | undefined} token
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ id: string, email: string, touched: boolean } | null>}
 */
export async function getSessionAccount(db, token, { now = Date.now() } = {}) {
	if (!token || !TOKEN_RE.test(token)) return null;
	const hash = await sha256Hex(token);
	const row = await db
		.prepare(
			`SELECT a.id, a.email, s.last_seen_at FROM account_sessions s
			JOIN accounts a ON a.id = s.account_id
			WHERE s.token_hash = ?1 AND a.deleted_at IS NULL`
		)
		.bind(hash)
		.first();
	if (!row) return null;
	let touched = false;
	if (now - Number(row.last_seen_at) >= LAST_SEEN_EVERY_MS) {
		await db
			.prepare('UPDATE account_sessions SET last_seen_at = ?2 WHERE token_hash = ?1')
			.bind(hash, now)
			.run();
		touched = true;
	}
	return { id: String(row.id), email: String(row.email), touched };
}

/**
 * Cierra la sesión de este token (si existe).
 *
 * @param {D1Database} db
 * @param {string | undefined} token
 */
export async function destroySession(db, token) {
	if (!token || !TOKEN_RE.test(token)) return;
	await db
		.prepare('DELETE FROM account_sessions WHERE token_hash = ?1')
		.bind(await sha256Hex(token))
		.run();
}

/**
 * Cierra todas las sesiones de la cuenta menos la de `keepToken` (al cambiar la contraseña).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string | undefined} keepToken
 */
export async function destroyOtherSessions(db, accountId, keepToken) {
	const keep = keepToken ? await sha256Hex(keepToken) : '';
	await db
		.prepare('DELETE FROM account_sessions WHERE account_id = ?1 AND token_hash != ?2')
		.bind(accountId, keep)
		.run();
}

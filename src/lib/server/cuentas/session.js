/**
 * Sesiones de las cuentas del público (tabla `account_sessions`). Aparte de la sesión de admins
 * (cookie `userToken` de GitHub, ver src/lib/server/auth.js): una no toca a la otra.
 *
 * - Duran hasta que la persona cierra sesión (decisión P7.11): el servidor no las vence nunca.
 *   Los navegadores topean las cookies en unos 400 días, así que la cookie se vuelve a mandar
 *   (con 400 días más) cada vez que se actualiza `last_seen_at`: mientras la persona entre al
 *   sitio de vez en cuando, no se cae.
 * - La cookie lleva un token al azar de 256 bits; en la base solo está su SHA-256.
 * - El cron nocturno borra las sesiones que ya no tienen cookie en ningún navegador (más de 401
 *   días sin `last_seen_at`; ver ./sessionAge.js): no cierra la sesión de nadie.
 * - Cookie httpOnly, Secure (salvo http://localhost) y SameSite=Lax.
 * - «Dónde tenés la sesión abierta» (Mi rincón): de cada sesión se muestra cómo se entró, cuándo,
 *   la última vez (aproximada: `last_seen_at`) y el navegador (`device`, migración 0065: un nombre
 *   corto como «Firefox en Android», nunca el user agent entero; ver $lib/utils/userAgent.js). La
 *   IP no se guarda nunca. La página no ve ni el token ni su hash: cada sesión va con un id que
 *   sale del hash (`publicSessionId`), y cerrarla se busca siempre entre las de esa cuenta.
 */
import { sha256Hex } from '$lib/server/hash.js';
import { parseReadingSpeed } from '$lib/utils/readingTime.js';
import { DEVICE_LABEL_MAX } from '$lib/utils/userAgent.js';
import { randomToken } from './crypto.js';
import { SESSION_COOKIE_MAX_AGE } from './sessionAge.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {'code' | 'password' | 'passkey'} LoginMethod */

export const SESSION_COOKIE = 'kvRincon';
/** Lo más que aceptan los navegadores (Chrome topea en 400 días); ver ./sessionAge.js. */
export { SESSION_COOKIE_MAX_AGE };
/** `last_seen_at` se actualiza como mucho una vez cada tanto, para no escribir en cada página. */
export const LAST_SEEN_EVERY_MS = 24 * 60 * 60 * 1000;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_RE = /^[0-9a-f]{32}$/;
/** Lo más que lista «Dónde tenés la sesión abierta» (las más recientes). */
export const SESSION_LIST_LIMIT = 50;

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
 * `device`: el nombre corto del navegador (`deviceLabel()` de $lib/utils/userAgent.js), o nada.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {LoginMethod} method
 * @param {{ now?: number, device?: string | null }} [opts]
 */
export async function createSession(
	db,
	accountId,
	method,
	{ now = Date.now(), device = null } = {}
) {
	const token = randomToken();
	const label = typeof device === 'string' && device ? device.slice(0, DEVICE_LABEL_MAX) : null;
	await db
		.prepare(
			`INSERT INTO account_sessions (token_hash, account_id, method, created_at, last_seen_at,
				device)
			VALUES (?1, ?2, ?3, ?4, ?4, ?5)`
		)
		.bind(await sha256Hex(token), accountId, method, now, label)
		.run();
	return token;
}

/**
 * El id con el que una sesión va a la página («Cerrar esta»): sale del hash del token, así ni el
 * token ni su hash llegan nunca al navegador.
 *
 * @param {string} tokenHash
 */
async function publicSessionId(tokenHash) {
	return (await sha256Hex(`sesion:${tokenHash}`)).slice(0, 32);
}

/**
 * El id público de la sesión de este token (para saber si «Cerrar esta» es la de este navegador).
 *
 * @param {string | undefined} token
 * @returns {Promise<string | null>}
 */
export async function sessionIdOfToken(token) {
	if (!token || !TOKEN_RE.test(token)) return null;
	return publicSessionId(await sha256Hex(token));
}

/**
 * @typedef {{ id: string, method: LoginMethod, device: string | null, createdAt: number,
 *   lastSeenAt: number, current: boolean }} SessionInfo
 */

/**
 * Las sesiones abiertas de la cuenta, para «Dónde tenés la sesión abierta»: la de este navegador
 * (`currentToken`) primero y después las demás, de la usada más recientemente a la más vieja.
 * Solo las de `accountId`.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string | undefined} currentToken
 * @returns {Promise<SessionInfo[]>}
 */
export async function listSessions(db, accountId, currentToken) {
	const current = currentToken && TOKEN_RE.test(currentToken) ? await sha256Hex(currentToken) : '';
	const { results } = await db
		.prepare(
			`SELECT token_hash, method, device, created_at, last_seen_at FROM account_sessions
			WHERE account_id = ?1
			ORDER BY token_hash = ?2 DESC, last_seen_at DESC, created_at DESC LIMIT ?3`
		)
		.bind(accountId, current, SESSION_LIST_LIMIT)
		.all();
	return Promise.all(
		results.map(async (r) => ({
			id: await publicSessionId(String(r.token_hash)),
			method: /** @type {LoginMethod} */ (String(r.method)),
			device: r.device == null ? null : String(r.device),
			createdAt: Number(r.created_at),
			lastSeenAt: Number(r.last_seen_at),
			current: r.token_hash === current
		}))
	);
}

/**
 * Cierra una sesión de la cuenta por su id público («Cerrar esta»). Solo busca entre las sesiones
 * de `accountId`: con el id de una sesión de otra cuenta no pasa nada. Desde que se borra la fila,
 * esa cookie ya no abre nada (`getSessionAccount` busca la fila en cada pedido).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {unknown} sessionId
 * @returns {Promise<boolean>} `false` si esa cuenta no tiene una sesión con ese id
 */
export async function endSessionById(db, accountId, sessionId) {
	if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) return false;
	const { results } = await db
		.prepare('SELECT token_hash FROM account_sessions WHERE account_id = ?1')
		.bind(accountId)
		.all();
	for (const r of results) {
		const hash = String(r.token_hash);
		if ((await publicSessionId(hash)) !== sessionId) continue;
		const res = await db
			.prepare('DELETE FROM account_sessions WHERE token_hash = ?1 AND account_id = ?2')
			.bind(hash, accountId)
			.run();
		return Number(res.meta?.changes ?? 0) > 0;
	}
	return false;
}

/**
 * La cuenta de la sesión de este token, o `null`. `touched` dice si se actualizó
 * `last_seen_at` (entonces hay que volver a mandar la cookie).
 *
 * En la misma consulta vienen dos datos de la cuenta que se usan en muchas páginas, para no
 * volver a leer la fila (la base está lejos: cada consulta es una ida y vuelta): la velocidad de
 * lectura (`readingSpeed`, como `getReadingSpeed`) y el permiso de tener perfiles
 * (`canHaveProfiles`, como `canHaveProfiles`). Nunca `preferences` entero: ahí está el DNI
 * guardado (savedBuyer.js), que no tiene que viajar en `locals`.
 *
 * @param {D1Database} db
 * @param {string | undefined} token
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ id: string, email: string, readingSpeed: number | null,
 *   canHaveProfiles: boolean, touched: boolean } | null>}
 */
export async function getSessionAccount(db, token, { now = Date.now() } = {}) {
	if (!token || !TOKEN_RE.test(token)) return null;
	const hash = await sha256Hex(token);
	const row = await db
		.prepare(
			`SELECT a.id, a.email, s.last_seen_at,
				json_extract(a.preferences, '$.readingSpeed') AS reading_speed,
				a.can_have_profiles
			FROM account_sessions s
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
	return {
		id: String(row.id),
		email: String(row.email),
		readingSpeed: parseReadingSpeed(row.reading_speed ?? null),
		canHaveProfiles: Number(row.can_have_profiles) === 1,
		touched
	};
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

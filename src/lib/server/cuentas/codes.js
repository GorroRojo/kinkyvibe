/**
 * Códigos de un solo uso que se mandan por mail (tabla `login_codes`): para ingresar y para
 * confirmar las acciones delicadas de Mi rincón. Cada código tiene un `purpose` y solo sirve para
 * ese: uno de ingreso no confirma nada, y uno de confirmación no sirve para ingresar.
 *
 * - 6 cifras al azar, válidos 10 minutos, hasta 5 intentos cada uno. Pedir uno nuevo anula los
 *   anteriores de ese mail y ese `purpose`.
 * - Solo se guarda el hash del código (SHA-256 de "<id de la fila>:<purpose>:<código>": el id, al
 *   azar, hace de sal) y el hash del mail, nunca el mail ni el código.
 * - Cada intento suma al contador ANTES de comparar, en la misma sentencia que busca el código:
 *   dos intentos simultáneos no pueden pasarse de 5.
 * - Los límites por mail y por conexión (cuántos códigos se piden, cuántos intentos) van en
 *   index.js, con rate_limits.
 */
import { sha256Hex, timingSafeEqual } from '$lib/server/hash.js';
import { randomDigits } from './crypto.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * Para qué sirve un código: 'login' (ingresar), 'password' (poner, cambiar o sacar la
 * contraseña), 'delete' (borrar la cuenta) o 'grupo' (cambiar dueñes de un grupo o borrarlo).
 * @typedef {'login' | 'password' | 'delete' | 'grupo'} CodePurpose
 */

export const CODE_PURPOSES = /** @type {const} */ (['login', 'password', 'delete', 'grupo']);

export const CODE_DIGITS = 6;
export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
/** Los códigos vencidos se borran después de esto (quedan un rato para los límites y el debug). */
const CODE_KEEP_MS = 24 * 60 * 60 * 1000;

/**
 * Lo que escribió la persona, solo cifras (acepta "123 456" o "123-456"), o `null`.
 *
 * @param {unknown} raw
 */
export function normalizeCode(raw) {
	if (typeof raw !== 'string') return null;
	const digits = raw.replace(/[\s-]/g, '');
	return new RegExp(`^\\d{${CODE_DIGITS}}$`).test(digits) ? digits : null;
}

/**
 * @param {string} id
 * @param {CodePurpose} purpose
 * @param {string} code
 */
function codeHash(id, purpose, code) {
	return sha256Hex(`${id}:${purpose}:${code}`);
}

/** @param {string} purpose */
function checkPurpose(purpose) {
	if (!(/** @type {readonly string[]} */ (CODE_PURPOSES).includes(purpose)))
		throw new RangeError(`purpose desconocido: ${purpose}`);
}

/**
 * Crea un código nuevo para este mail y este `purpose` (anula los anteriores del mismo purpose)
 * y lo devuelve en claro para mandarlo por mail. No se guarda en claro en ningún lado.
 *
 * @param {D1Database} db
 * @param {string} emailHash
 * @param {{ now?: number, purpose?: CodePurpose }} [opts]
 */
export async function createLoginCode(db, emailHash, { now = Date.now(), purpose = 'login' } = {}) {
	checkPurpose(purpose);
	const id = crypto.randomUUID();
	const code = randomDigits(CODE_DIGITS);
	await db.batch([
		db.prepare('DELETE FROM login_codes WHERE expires_at < ?1').bind(now - CODE_KEEP_MS),
		db
			.prepare(
				`UPDATE login_codes SET used_at = ?2
				WHERE email_hash = ?1 AND purpose = ?3 AND used_at IS NULL`
			)
			.bind(emailHash, now, purpose),
		db
			.prepare(
				`INSERT INTO login_codes
					(id, email_hash, purpose, code_hash, attempts, created_at, expires_at)
				VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6)`
			)
			.bind(id, emailHash, purpose, await codeHash(id, purpose, code), now, now + CODE_TTL_MS)
	]);
	return { code, expiresAt: now + CODE_TTL_MS };
}

/**
 * Verifica un código de este `purpose`. Un código correcto se marca usado (una sola vez, aunque
 * lleguen dos pedidos a la vez). Los códigos de otro purpose ni se miran.
 *
 * @param {D1Database} db
 * @param {string} emailHash
 * @param {string} code ya normalizado
 * @param {{ now?: number, purpose?: CodePurpose }} [opts]
 * @returns {Promise<'ok' | 'wrong' | 'expired'>} `expired`: no hay código vigente (vencido,
 *   usado, sin intentos o nunca pedido)
 */
export async function verifyLoginCode(
	db,
	emailHash,
	code,
	{ now = Date.now(), purpose = 'login' } = {}
) {
	checkPurpose(purpose);
	const row = await db
		.prepare(
			`UPDATE login_codes SET attempts = attempts + 1
			WHERE id = (
				SELECT id FROM login_codes
				WHERE email_hash = ?1 AND purpose = ?4 AND used_at IS NULL AND expires_at > ?2
					AND attempts < ?3
				ORDER BY created_at DESC LIMIT 1
			)
			RETURNING id, code_hash`
		)
		.bind(emailHash, now, CODE_MAX_ATTEMPTS, purpose)
		.first();
	if (!row) return 'expired';
	const ok = timingSafeEqual(await codeHash(String(row.id), purpose, code), String(row.code_hash));
	if (!ok) return 'wrong';
	const used = await db
		.prepare('UPDATE login_codes SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL')
		.bind(row.id, now)
		.run();
	return used.meta.changes ? 'ok' : 'expired';
}

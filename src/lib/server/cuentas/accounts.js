/**
 * Cuentas del público (tabla `accounts`, migrations/0013_cuentas.sql). Separadas del login de
 * admins con GitHub (decisión P7.8).
 *
 * - Una cuenta nace en el primer ingreso con código por mail: el mail queda verificado.
 * - La contraseña es opcional (se pone desde "Mi rincón").
 * - Borrar la cuenta: las órdenes quedan, desvinculadas (P7.6); se van las sesiones, los códigos
 *   pendientes y todos los datos de la persona (la fila queda vacía, con `deleted_at`).
 */
import { sha256Hex } from '$lib/server/hash.js';
import { logAccountCreated } from '$lib/server/admin/accountEvents.js';
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from './password.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{
 *   id: string, email: string, email_verified_at: number | null, has_password: boolean,
 *   created_at: number
 * }} Account
 */

const EMAIL_RE = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/;

/**
 * Mail normalizado (sin espacios, minúsculas, como lo guarda la compra) o `null` si no parece
 * un mail.
 *
 * @param {unknown} raw
 */
export function normalizeEmail(raw) {
	if (typeof raw !== 'string') return null;
	const email = raw.trim().toLowerCase();
	if (email.length < 3 || email.length > 254 || !EMAIL_RE.test(email)) return null;
	return email;
}

/**
 * Hash del mail para códigos y límites (nunca se guarda el mail fuera de `accounts`).
 *
 * @param {string} email ya normalizado
 */
export function emailHash(email) {
	return sha256Hex(`cuentas:email:${email}`);
}

/** @param {Record<string, unknown>} row @returns {Account} */
function toAccount(row) {
	return {
		id: String(row.id),
		email: String(row.email),
		email_verified_at: row.email_verified_at == null ? null : Number(row.email_verified_at),
		has_password: row.password_hash != null,
		created_at: Number(row.created_at)
	};
}

const ACCOUNT_COLUMNS = 'id, email, email_verified_at, password_hash, created_at';

/**
 * Cuenta activa (no borrada) por id, o `null`.
 *
 * @param {D1Database} db
 * @param {string} id
 */
export async function getAccount(db, id) {
	const row = await db
		.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE id = ?1 AND deleted_at IS NULL`)
		.bind(id)
		.first();
	return row ? toAccount(row) : null;
}

/**
 * Cuenta activa por mail (normalizado), o `null`.
 *
 * @param {D1Database} db
 * @param {string} email
 */
export async function getAccountByEmail(db, email) {
	const row = await db
		.prepare(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE email = ?1 AND deleted_at IS NULL`)
		.bind(email)
		.first();
	return row ? toAccount(row) : null;
}

/**
 * La cuenta de este mail recién verificado: la crea si no existe y marca el mail como
 * verificado si todavía no lo estaba. Una sola sentencia, así dos ingresos simultáneos no
 * pueden crear dos cuentas.
 *
 * @param {D1Database} db
 * @param {string} email normalizado
 * @param {{ now?: number }} [opts]
 */
export async function upsertVerifiedAccount(db, email, { now = Date.now() } = {}) {
	const row = await db
		.prepare(
			`INSERT INTO accounts (id, email, email_verified_at, created_at, updated_at)
			VALUES (?1, ?2, ?3, ?3, ?3)
			ON CONFLICT (email) DO UPDATE SET
				email_verified_at = COALESCE(accounts.email_verified_at, excluded.email_verified_at),
				updated_at = excluded.updated_at
			RETURNING ${ACCOUNT_COLUMNS}`
		)
		.bind(crypto.randomUUID(), email, now)
		.first();
	if (!row) throw new Error('No se pudo crear la cuenta');
	const account = toAccount(row);
	// Recién creada (y no una que ya existía): queda en la actividad del panel, sin el mail. Nunca
	// frena el ingreso.
	if (account.created_at === now) await logAccountCreated(db, account.id, { now });
	return account;
}

/**
 * Pone o cambia la contraseña. Devuelve el mensaje de error o `null`.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {unknown} password
 * @param {{ now?: number, iterations?: number }} [opts] `iterations` solo para tests
 */
export async function setPassword(db, accountId, password, { now = Date.now(), iterations } = {}) {
	const problem = passwordProblem(password);
	if (problem) return problem;
	const hash = await hashPassword(/** @type {string} */ (password), { iterations });
	const res = await db
		.prepare(
			`UPDATE accounts SET password_hash = ?2, password_updated_at = ?3, updated_at = ?3
			WHERE id = ?1 AND deleted_at IS NULL`
		)
		.bind(accountId, hash, now)
		.run();
	return res.meta.changes ? null : 'No encontramos tu cuenta.';
}

/**
 * Saca la contraseña (queda solo el código por mail).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 */
export async function removePassword(db, accountId, { now = Date.now() } = {}) {
	await db
		.prepare(
			`UPDATE accounts SET password_hash = NULL, password_updated_at = ?2, updated_at = ?2
			WHERE id = ?1 AND deleted_at IS NULL`
		)
		.bind(accountId, now)
		.run();
}

/**
 * Ingreso con mail y contraseña. Devuelve la cuenta o `null`, sin decir por qué (ni si el mail
 * tiene cuenta ni si tiene contraseña: cuesta lo mismo en los tres casos). Los límites de
 * intentos van antes, en la action (ver index.js).
 *
 * @param {D1Database} db
 * @param {string} email normalizado
 * @param {string} password
 * @param {{ now?: number }} [opts]
 */
export async function checkPassword(db, email, password, { now = Date.now() } = {}) {
	const row = await db
		.prepare(
			`SELECT ${ACCOUNT_COLUMNS} FROM accounts
			WHERE email = ?1 AND deleted_at IS NULL AND email_verified_at IS NOT NULL`
		)
		.bind(email)
		.first();
	const stored = row?.password_hash == null ? null : String(row.password_hash);
	const ok = await verifyPassword(password, stored);
	if (!ok || !row || !stored) return null;
	if (needsRehash(stored)) {
		// Parámetros viejos: se rehace el hash ahora que tenemos la contraseña en la mano.
		const hash = await hashPassword(password);
		await db
			.prepare('UPDATE accounts SET password_hash = ?2, updated_at = ?3 WHERE id = ?1')
			.bind(row.id, hash, now)
			.run();
	}
	return toAccount(row);
}

/**
 * Borra la cuenta: las órdenes quedan (desvinculadas), las sesiones, los códigos pendientes y lo
 * seguido se van, y la fila queda sin ningún dato de la persona. Todo en una tanda atómica.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<boolean>} `false` si no había una cuenta activa con ese id
 */
export async function deleteAccount(db, accountId, { now = Date.now() } = {}) {
	const account = await getAccount(db, accountId);
	if (!account) return false;
	const hash = await emailHash(account.email);
	await db.batch([
		db.prepare('UPDATE orders SET account_id = NULL WHERE account_id = ?1').bind(accountId),
		db.prepare('DELETE FROM account_sessions WHERE account_id = ?1').bind(accountId),
		db.prepare('DELETE FROM login_codes WHERE email_hash = ?1').bind(hash),
		// «Lo que sigo» (migración 0032): lo seguido y los avisos ya mandados son de la persona.
		db.prepare('DELETE FROM follows WHERE account_id = ?1').bind(accountId),
		db.prepare('DELETE FROM follow_notifications WHERE account_id = ?1').bind(accountId),
		// El chat de Telegram vinculado y sus códigos (migración 0033).
		db.prepare('DELETE FROM telegram_chats WHERE account_id = ?1').bind(accountId),
		db.prepare('DELETE FROM telegram_link_codes WHERE account_id = ?1').bind(accountId),
		db
			.prepare(
				`UPDATE accounts SET email = NULL, email_verified_at = NULL, password_hash = NULL,
					password_updated_at = NULL, preferences = '{}', can_have_profiles = 0, updated_at = ?2,
					deleted_at = ?2
				WHERE id = ?1 AND deleted_at IS NULL`
			)
			.bind(accountId, now)
	]);
	return true;
}

/**
 * ¿La cuenta eligió "No recibir invitaciones de proyectos"? (`preferences.noGroupInvites`)
 *
 * @param {D1Database} db
 * @param {string} accountId
 */
export async function getNoGroupInvites(db, accountId) {
	const row = await db
		.prepare(
			`SELECT json_extract(preferences, '$.noGroupInvites') AS v FROM accounts
			WHERE id = ?1 AND deleted_at IS NULL`
		)
		.bind(accountId)
		.first();
	return Number(row?.v) === 1;
}

/**
 * Prende o apaga "No recibir invitaciones de proyectos". Apagado, la clave se saca (no queda nada).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {boolean} value
 * @param {{ now?: number }} [opts]
 */
export async function setNoGroupInvites(db, accountId, value, { now = Date.now() } = {}) {
	await db
		.prepare(
			`UPDATE accounts SET updated_at = ?2, preferences = CASE WHEN ?3
				THEN json_set(preferences, '$.noGroupInvites', json('true'))
				ELSE json_remove(preferences, '$.noGroupInvites') END
			WHERE id = ?1 AND deleted_at IS NULL`
		)
		.bind(accountId, now, value ? 1 : 0)
		.run();
}

/**
 * ¿La cuenta tiene el permiso "puede tener perfiles"? (`accounts.can_have_profiles`, migración
 * 0015). Apagado por defecto: lo prende une admin desde el panel (Cuentas). Sin el permiso, la
 * cuenta no ve nada de perfiles y toda acción de perfiles se rechaza (docs/cuentas.md).
 *
 * Ante cualquier error (por ejemplo, una base sin la migración 0015) responde `false`: sin
 * permiso, que es lo seguro. Una cuenta borrada nunca lo tiene.
 *
 * @param {D1Database} db
 * @param {string} accountId
 */
export async function canHaveProfiles(db, accountId) {
	if (typeof accountId !== 'string' || !accountId) return false;
	try {
		const row = await db
			.prepare('SELECT can_have_profiles AS v FROM accounts WHERE id = ?1 AND deleted_at IS NULL')
			.bind(accountId)
			.first();
		return Number(row?.v) === 1;
	} catch (error) {
		console.error('[cuentas] no se pudo leer el permiso de perfiles:', error);
		return false;
	}
}

/**
 * Calendario personal ("lo tuyo"): los eventos para los que la cuenta tiene entradas, en un .ics
 * con un link secreto (tabla `calendar_feeds`, migración 0020). Se guarda solo el hash del token:
 * el link se ve una vez, al crearlo. Crear uno nuevo revoca el anterior; revocar borra la fila y
 * el link deja de andar al instante.
 */
import { sha256Hex } from '$lib/server/hash.js';
import { randomToken } from '$lib/server/cuentas/crypto.js';
import { ordersForAccount } from '$lib/server/cuentas/orders.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Cada cuánto, como mucho, se actualiza "usado por última vez". */
const TOUCH_EVERY_MS = 24 * 60 * 60 * 1000;

/** Compras que cuentan como "tenés entrada" (no las reembolsadas). */
const HAS_TICKET = new Set(['approved', 'awaiting_transfer']);

/** @param {unknown} token */
const validToken = (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

/**
 * Crea el link de la cuenta (y revoca el anterior, si había). Devuelve el token: es la única vez
 * que se puede ver.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} [now]
 */
export async function createFeedToken(db, accountId, now = Date.now()) {
	const token = randomToken();
	await db.batch([
		db.prepare('DELETE FROM calendar_feeds WHERE account_id = ?1').bind(accountId),
		db
			.prepare('INSERT INTO calendar_feeds (token_hash, account_id, created_at) VALUES (?1, ?2, ?3)')
			.bind(await sha256Hex(token), accountId, now)
	]);
	return token;
}

/**
 * Revoca el link de la cuenta.
 *
 * @param {D1Database} db
 * @param {string} accountId
 */
export async function revokeFeeds(db, accountId) {
	await db.prepare('DELETE FROM calendar_feeds WHERE account_id = ?1').bind(accountId).run();
}

/**
 * El link activo de la cuenta (sin el token, que no se guarda), o `null`.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<{ createdAt: number, lastUsedAt: number | null } | null>}
 */
export async function feedInfo(db, accountId) {
	const row = await db
		.prepare(
			'SELECT created_at, last_used_at FROM calendar_feeds WHERE account_id = ?1 ORDER BY created_at DESC LIMIT 1'
		)
		.bind(accountId)
		.first();
	if (!row) return null;
	return {
		createdAt: Number(row.created_at),
		lastUsedAt: row.last_used_at == null ? null : Number(row.last_used_at)
	};
}

/**
 * La cuenta de un link (si existe y la cuenta no se borró), o `null`.
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @param {number} [now]
 * @returns {Promise<string | null>}
 */
export async function accountForFeed(db, token, now = Date.now()) {
	if (!validToken(token)) return null;
	const hash = await sha256Hex(/** @type {string} */ (token));
	const row = await db
		.prepare(
			`SELECT f.account_id, f.last_used_at FROM calendar_feeds f
			JOIN accounts a ON a.id = f.account_id AND a.deleted_at IS NULL
			WHERE f.token_hash = ?1`
		)
		.bind(hash)
		.first();
	if (!row) return null;
	if (row.last_used_at == null || Number(row.last_used_at) < now - TOUCH_EVERY_MS) {
		await db
			.prepare('UPDATE calendar_feeds SET last_used_at = ?2 WHERE token_hash = ?1')
			.bind(hash, now)
			.run();
	}
	return String(row.account_id);
}

/**
 * Los eventos (slugs) para los que la cuenta tiene entradas.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<Set<string>>}
 */
export async function ticketedSlugs(db, accountId) {
	const orders = await ordersForAccount(db, accountId);
	return new Set(orders.filter((o) => HAS_TICKET.has(o.status)).map((o) => o.event_slug));
}

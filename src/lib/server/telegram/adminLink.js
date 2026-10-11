/**
 * Vincular el Telegram de une admin desde el panel (la puerta por Telegram, decisión 0037;
 * migración 0050). Les admins entran con GitHub y no tienen cuenta pública (Mi rincón), así que
 * esto no usa `telegram_chats` (link.js): tiene su propia tabla, por id de GitHub.
 *
 * 1. En Ajustes → Admins, «Vincular Telegram» crea un código al azar, de un solo uso, que vence en
 *    15 minutos (se guarda solo su hash) y muestra el link `t.me/<bot>?start=adm_<código>`.
 * 2. El bot recibe `/start adm_<código>` **por chat privado** (router.js): si el código vale (y
 *    quien lo creó sigue siendo admin), se marca usado en la misma sentencia que lo lee y queda
 *    vinculado `id de GitHub ↔ id del usuario de Telegram`. Queda en el registro (`admin_audit`).
 * 3. «Desvincular» en el panel borra el vínculo y los códigos; también queda en el registro.
 * 4. La puerta (puerta.js) mira el vínculo **y** `isAdmin` en cada pedido: sacar a alguien de
 *    `ADMINS` le corta la puerta aunque el vínculo siga en la base.
 *
 * De Telegram solo se guarda el id del usuario. Los intentos se topean por usuario de Telegram y
 * crear códigos, por admin.
 */
import { isAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { LINK_CODE_TTL_MS, generateLinkCode, normalizeLinkCode } from './link.js';
import { ADMIN_START_PREFIX } from './nav.js';

export { ADMIN_START_PREFIX };

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ id: number, login: string }} AdminIdentity */

/** Cuánto dura un código (lo mismo que los de Mi rincón). */
export const ADMIN_LINK_CODE_TTL_MS = LINK_CODE_TTL_MS;

/** Intentos de `/start adm_…` por usuario de Telegram. */
export const ADMIN_LINK_ATTEMPTS_LIMIT = Object.freeze({ limit: 10, windowSeconds: 60 * 60 });

/** Códigos nuevos por admin. */
export const ADMIN_LINK_CODES_LIMIT = Object.freeze({ limit: 10, windowSeconds: 60 * 60 });

/** El parámetro de `?start=` para un código. @param {string} code */
export const adminStartParam = (code) => `${ADMIN_START_PREFIX}${code}`;

/**
 * @param {unknown} user
 * @returns {user is AdminIdentity}
 */
function isIdentity(user) {
	const u = /** @type {any} */ (user);
	return (
		!!u &&
		Number.isSafeInteger(u.id) &&
		typeof u.login === 'string' &&
		u.login.length >= 1 &&
		u.login.length <= 100
	);
}

/**
 * Crea un código para le admin. Los que tenía sin usar dejan de valer (hay uno solo vivo).
 *
 * @param {D1Database} db
 * @param {AdminIdentity} admin le admin con sesión (`requireAdmin`)
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, code: string, expiresAt: number }
 *   | { ok: false, reason: 'too_many' | 'not_admin' }>}
 */
export async function createAdminLinkCode(db, admin, { now = Date.now() } = {}) {
	if (!isIdentity(admin) || !isAdmin(admin)) return { ok: false, reason: 'not_admin' };
	const rate = await hitRateLimit(db, `tg:adm-codigo:${admin.id}`, ADMIN_LINK_CODES_LIMIT, now);
	if (!rate.allowed) return { ok: false, reason: 'too_many' };
	const code = generateLinkCode();
	const expiresAt = now + ADMIN_LINK_CODE_TTL_MS;
	await db.batch([
		// Los viejos de le admin (usados o no) y los vencidos de todes: la tabla queda chica.
		db
			.prepare('DELETE FROM telegram_admin_link_codes WHERE github_id = ?1 OR expires_at < ?2')
			.bind(admin.id, now),
		db
			.prepare(
				`INSERT INTO telegram_admin_link_codes
					(code_hash, github_id, github_login, created_at, expires_at)
				VALUES (?1, ?2, ?3, ?4, ?5)`
			)
			.bind(await sha256Hex(code), admin.id, admin.login, now, expiresAt)
	]);
	return { ok: true, code, expiresAt };
}

/**
 * Usa un código para vincular. Solo por chat privado (lo mira router.js).
 *
 * @param {D1Database} db
 * @param {string} param lo que vino después de `/start` (`adm_<código>`)
 * @param {number} telegramUserId `message.from.id`
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, login: string, replaced: boolean }
 *   | { ok: false, reason: 'invalid' | 'too_many' }>}
 */
export async function consumeAdminLinkCode(db, param, telegramUserId, { now = Date.now() } = {}) {
	if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
		return { ok: false, reason: 'invalid' };
	}
	const userId = String(telegramUserId);
	const rate = await hitRateLimit(db, `tg:adm:${userId}`, ADMIN_LINK_ATTEMPTS_LIMIT, now);
	if (!rate.allowed) return { ok: false, reason: 'too_many' };
	if (typeof param !== 'string' || !param.startsWith(ADMIN_START_PREFIX)) {
		return { ok: false, reason: 'invalid' };
	}
	const code = normalizeLinkCode(param.slice(ADMIN_START_PREFIX.length));
	if (!code) return { ok: false, reason: 'invalid' };
	// Leer y marcar usado en una sola sentencia: dos pedidos a la vez no lo usan dos veces.
	const row = await db
		.prepare(
			`UPDATE telegram_admin_link_codes SET used_at = ?2
			WHERE code_hash = ?1 AND used_at IS NULL AND expires_at > ?2
			RETURNING github_id, github_login`
		)
		.bind(await sha256Hex(code), now)
		.first();
	if (!row) return { ok: false, reason: 'invalid' };
	const admin = { id: Number(row.github_id), login: String(row.github_login) };
	// Le sacaron el permiso entre que creó el código y ahora: el código ya quedó usado.
	if (!isAdmin(admin)) return { ok: false, reason: 'invalid' };
	const [removed] = await db.batch([
		// Une admin, un Telegram; un Telegram, une admin: lo anterior de cualquiera de los dos se va.
		db
			.prepare('DELETE FROM telegram_admin_links WHERE github_id = ?1 OR telegram_user_id = ?2')
			.bind(admin.id, userId),
		db
			.prepare(
				`INSERT INTO telegram_admin_links (telegram_user_id, github_id, github_login, linked_at)
				VALUES (?1, ?2, ?3, ?4)`
			)
			.bind(userId, admin.id, admin.login, now)
	]);
	const replaced = Number(removed.meta?.changes ?? 0) > 0;
	await logAdminAction(
		db,
		{ user: admin },
		{
			action: 'telegram.admin_link',
			targetType: 'admin',
			targetId: admin.login,
			summary: replaced
				? 'Vinculó su Telegram para la puerta (reemplazó el vínculo anterior)'
				: 'Vinculó su Telegram para la puerta',
			detail: { replaced }
		},
		{ now }
	);
	return { ok: true, login: admin.login, replaced };
}

/**
 * El vínculo de le admin, o `null`.
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @returns {Promise<{ linkedAt: number } | null>}
 */
export async function getAdminTelegramLink(db, githubId) {
	const row = await db
		.prepare('SELECT linked_at FROM telegram_admin_links WHERE github_id = ?1')
		.bind(githubId)
		.first();
	return row ? { linkedAt: Number(row.linked_at) } : null;
}

/**
 * Los ids de GitHub con Telegram vinculado (para marcarlos en la lista de admins).
 *
 * @param {D1Database} db
 * @returns {Promise<Set<number>>}
 */
export async function linkedAdminIds(db) {
	const { results } = await db.prepare('SELECT github_id FROM telegram_admin_links').all();
	return new Set(results.map((r) => Number(r.github_id)));
}

/**
 * «Desvincular» desde el panel: borra el vínculo y los códigos de le admin. Si había vínculo,
 * queda en el registro. `false` si no estaba vinculade.
 *
 * @param {D1Database} db
 * @param {{ user?: AdminIdentity | null }} locals de acá sale quién fue (`locals.user`)
 * @param {{ now?: number }} [opts]
 */
export async function unlinkAdminTelegram(db, locals, { now = Date.now() } = {}) {
	const admin = locals?.user;
	if (!isIdentity(admin)) return false;
	const [r] = await db.batch([
		db.prepare('DELETE FROM telegram_admin_links WHERE github_id = ?1').bind(admin.id),
		db.prepare('DELETE FROM telegram_admin_link_codes WHERE github_id = ?1').bind(admin.id)
	]);
	const removed = Number(r.meta?.changes ?? 0) > 0;
	if (removed) {
		await logAdminAction(
			db,
			locals,
			{
				action: 'telegram.admin_unlink',
				targetType: 'admin',
				targetId: admin.login,
				summary: 'Desvinculó su Telegram de la puerta'
			},
			{ now }
		);
	}
	return removed;
}

/**
 * Le admin vinculade a este usuario de Telegram, sin mirar si sigue siendo admin. `null` si no
 * hay vínculo. Los permisos los decide quien llama, con `isAdmin` (puerta.js).
 *
 * @param {D1Database} db
 * @param {number} telegramUserId
 * @returns {Promise<AdminIdentity | null>}
 */
export async function linkedAdmin(db, telegramUserId) {
	if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) return null;
	const row = await db
		.prepare('SELECT github_id, github_login FROM telegram_admin_links WHERE telegram_user_id = ?1')
		.bind(String(telegramUserId))
		.first();
	return row ? { id: Number(row.github_id), login: String(row.github_login) } : null;
}

/**
 * Lo que el bot usa para `/start adm_<código>` (router.js no sabe de la base).
 *
 * @param {D1Database} db
 * @returns {import('./router.js').BotAdminLink}
 */
export function botAdminLink(db) {
	return async (param, telegramUserId) => {
		const r = await consumeAdminLinkCode(db, param, telegramUserId);
		return r.ok ? { linked: r.login } : r.reason;
	};
}

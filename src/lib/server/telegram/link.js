/**
 * Vincular un chat de Telegram con una cuenta (decisión 0029, fase 2; migración 0033).
 *
 * 1. En Mi rincón, «Conectar Telegram» crea un código corto, al azar, de un solo uso, que vence
 *    en 15 minutos. Se guarda solo su hash (SHA-256); el código se muestra una vez.
 * 2. La persona le manda `/vincular <código>` al bot **por chat privado** (en grupos el bot no
 *    vincula: eso lo decide router.js). Si el código vale, se marca usado en la misma sentencia
 *    que lo lee (dos pedidos a la vez no lo usan dos veces) y el chat queda vinculado.
 * 3. Un chat es de una sola cuenta y una cuenta tiene un solo chat: vincular de nuevo reemplaza.
 *
 * No se guarda nada del perfil de Telegram, solo el id del chat. Los intentos de `/vincular` se
 * topean por chat (para que nadie pruebe códigos al azar) y crear códigos, por cuenta.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Cuánto dura un código. */
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;

/** Sin 0/O ni 1/I, que se confunden al copiar: 32 caracteres, 5 bits cada uno. */
export const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 8 caracteres = 40 bits: con 15 minutos y el tope de intentos, no se adivina. */
export const LINK_CODE_LENGTH = 8;

/** Intentos de `/vincular` por chat. */
export const LINK_ATTEMPTS_LIMIT = Object.freeze({ limit: 10, windowSeconds: 60 * 60 });

/** Códigos nuevos por cuenta. */
export const LINK_CODES_LIMIT = Object.freeze({ limit: 10, windowSeconds: 60 * 60 });

/**
 * Un código nuevo, al azar (`crypto.getRandomValues`), sin sesgo: 256 es múltiplo de 32.
 *
 * @returns {string}
 */
export function generateLinkCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(LINK_CODE_LENGTH));
	return Array.from(bytes, (b) => LINK_CODE_ALPHABET[b % LINK_CODE_ALPHABET.length]).join('');
}

/**
 * Lo que escribió la persona, como código: sin espacios ni guiones, en mayúsculas. `null` si no
 * puede ser un código.
 *
 * @param {unknown} text
 */
export function normalizeLinkCode(text) {
	if (typeof text !== 'string') return null;
	const code = text.replace(/[\s-]/g, '').toUpperCase();
	if (code.length !== LINK_CODE_LENGTH) return null;
	for (const ch of code) if (!LINK_CODE_ALPHABET.includes(ch)) return null;
	return code;
}

/** "ABCD2345" → "ABCD-2345", para mostrarlo. @param {string} code */
export const displayLinkCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * Crea un código para la cuenta. Los que tenía sin usar dejan de valer (hay uno solo vivo).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, code: string, expiresAt: number } | { ok: false, reason: 'too_many' }>}
 */
export async function createLinkCode(db, accountId, { now = Date.now() } = {}) {
	const rate = await hitRateLimit(db, `tg:codigo:${accountId}`, LINK_CODES_LIMIT, now);
	if (!rate.allowed) return { ok: false, reason: 'too_many' };
	const code = generateLinkCode();
	const expiresAt = now + LINK_CODE_TTL_MS;
	await db.batch([
		// Los viejos de esta cuenta (usados o no) y los vencidos de todas: la tabla queda chica.
		db
			.prepare('DELETE FROM telegram_link_codes WHERE account_id = ?1 OR expires_at < ?2')
			.bind(accountId, now),
		db
			.prepare(
				`INSERT INTO telegram_link_codes (code_hash, account_id, created_at, expires_at)
				VALUES (?1, ?2, ?3, ?4)`
			)
			.bind(await sha256Hex(code), accountId, now, expiresAt)
	]);
	return { ok: true, code, expiresAt };
}

/**
 * Usa un código para vincular el chat. Solo por chat privado (lo mira quien llama).
 *
 * @param {D1Database} db
 * @param {string} text lo que vino después de `/vincular`
 * @param {number | string} chatId
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true, accountId: string } | { ok: false, reason: 'invalid' | 'too_many' }>}
 */
export async function consumeLinkCode(db, text, chatId, { now = Date.now() } = {}) {
	const chat = String(chatId);
	const rate = await hitRateLimit(db, `tg:vincular:${chat}`, LINK_ATTEMPTS_LIMIT, now);
	if (!rate.allowed) return { ok: false, reason: 'too_many' };
	const code = normalizeLinkCode(text);
	if (!code) return { ok: false, reason: 'invalid' };
	// Leer y marcar usado en una sola sentencia: dos pedidos a la vez no lo usan dos veces.
	const row = await db
		.prepare(
			`UPDATE telegram_link_codes SET used_at = ?2
			WHERE code_hash = ?1 AND used_at IS NULL AND expires_at > ?2
				AND account_id IN (SELECT id FROM accounts WHERE deleted_at IS NULL)
			RETURNING account_id`
		)
		.bind(await sha256Hex(code), now)
		.first();
	if (!row) return { ok: false, reason: 'invalid' };
	const accountId = String(row.account_id);
	await db.batch([
		// Un chat, una cuenta; una cuenta, un chat: lo anterior de cualquiera de los dos se va.
		db
			.prepare('DELETE FROM telegram_chats WHERE account_id = ?1 OR chat_id = ?2')
			.bind(accountId, chat),
		db
			.prepare(
				`INSERT INTO telegram_chats (account_id, chat_id, linked_at, muted, updated_at)
				VALUES (?1, ?2, ?3, 0, ?3)`
			)
			.bind(accountId, chat, now)
	]);
	return { ok: true, accountId };
}

/**
 * @typedef {{ chatId: string, linkedAt: number, muted: boolean }} TelegramLink
 */

/**
 * El chat vinculado de la cuenta, o `null`.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<TelegramLink | null>}
 */
export async function getTelegramLink(db, accountId) {
	const row = await db
		.prepare('SELECT chat_id, linked_at, muted FROM telegram_chats WHERE account_id = ?1')
		.bind(accountId)
		.first();
	if (!row) return null;
	return {
		chatId: String(row.chat_id),
		linkedAt: Number(row.linked_at),
		muted: Number(row.muted) === 1
	};
}

/**
 * «Desconectar» desde Mi rincón: borra el chat y los códigos de la cuenta.
 *
 * @param {D1Database} db
 * @param {string} accountId
 */
export async function unlinkAccount(db, accountId) {
	const [r] = await db.batch([
		db.prepare('DELETE FROM telegram_chats WHERE account_id = ?1').bind(accountId),
		db.prepare('DELETE FROM telegram_link_codes WHERE account_id = ?1').bind(accountId)
	]);
	return Number(r.meta?.changes ?? 0) > 0;
}

/**
 * `/desvincular` desde el bot. `false` si el chat no estaba vinculado.
 *
 * @param {D1Database} db
 * @param {number | string} chatId
 */
export async function unlinkChat(db, chatId) {
	const r = await db
		.prepare('DELETE FROM telegram_chats WHERE chat_id = ?1')
		.bind(String(chatId))
		.run();
	return Number(r.meta?.changes ?? 0) > 0;
}

/**
 * `/silenciar` y `/reanudar`. `false` si el chat no estaba vinculado.
 *
 * @param {D1Database} db
 * @param {number | string} chatId
 * @param {boolean} muted
 * @param {{ now?: number }} [opts]
 */
export async function setChatMuted(db, chatId, muted, { now = Date.now() } = {}) {
	const r = await db
		.prepare('UPDATE telegram_chats SET muted = ?2, updated_at = ?3 WHERE chat_id = ?1')
		.bind(String(chatId), muted ? 1 : 0, now)
		.run();
	return Number(r.meta?.changes ?? 0) > 0;
}

/**
 * Lo que el bot puede hacer con las cuentas (router.js no sabe de la base).
 *
 * @param {D1Database} db
 * @returns {import('./router.js').BotAccounts}
 */
export function botAccounts(db) {
	return {
		link: async (code, chatId) => {
			const r = await consumeLinkCode(db, code, chatId);
			return r.ok ? 'linked' : r.reason;
		},
		unlink: (chatId) => unlinkChat(db, chatId),
		setMuted: (chatId, muted) => setChatMuted(db, chatId, muted)
	};
}

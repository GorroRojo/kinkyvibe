/**
 * Pegamento entre la fase 2 del bot (vincular cuentas, avisos de «Lo que sigo») y las páginas de
 * Mi rincón. Todo detrás de los tres interruptores: `telegram_bot`, `lo_que_sigo` y `cuentas`.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { isFlagOn } from '$lib/server/flags.js';
import { getTelegramLink } from './link.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Lo que la tarjeta «Telegram» de Mi rincón necesita saber.
 *
 * @typedef {{ linked: boolean, muted: boolean, linkedAt: number | null, botUsername: string | null }} TelegramCardData
 */

/**
 * ¿Se puede vincular Telegram? Los tres interruptores prendidos (y una base).
 *
 * @param {App.Platform | undefined} platform
 */
export async function telegramLinkingEnabled(platform) {
	const db = getDB(platform);
	if (!db) return false;
	for (const key of /** @type {const} */ (['telegram_bot', 'lo_que_sigo', 'cuentas'])) {
		if (!(await isFlagOn(db, key))) return false;
	}
	return true;
}

/**
 * El usuario del bot (variable `TELEGRAM_BOT_USERNAME`, no es un secreto), para el link
 * `t.me/<bot>`. `null` si no está o no tiene forma de usuario de Telegram.
 */
export function botUsername() {
	const name = String(env.TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '');
	return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name) ? name : null;
}

/**
 * Lo de la tarjeta, o `null` con algún interruptor apagado (no se muestra nada de Telegram).
 *
 * @param {App.Platform | undefined} platform
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<TelegramCardData | null>}
 */
export async function telegramCardData(platform, db, accountId) {
	if (!(await telegramLinkingEnabled(platform))) return null;
	const link = await getTelegramLink(db, accountId);
	return {
		linked: Boolean(link),
		muted: link?.muted ?? false,
		linkedAt: link?.linkedAt ?? null,
		botUsername: botUsername()
	};
}

/**
 * Las filas de «Lo que sigo» con las casillas de Telegram dentro de `options`, solo si la cuenta
 * tiene el chat vinculado (si no, la grilla muestra la columna apagada y no hacen falta).
 *
 * @template {{ options: import('$lib/utils/sigo.js').FollowOptions,
 *   telegram: import('$lib/utils/sigo.js').TelegramOptions }} R
 * @param {R[]} rows
 * @param {TelegramCardData | null} telegram
 * @returns {R[]}
 */
export function withTelegramOptions(rows, telegram) {
	if (!telegram?.linked) return rows;
	return rows.map((r) => ({ ...r, options: { ...r.options, ...r.telegram } }));
}

/**
 * «Lo que sigo» (decisión 0025): qué sigue cada cuenta y qué quiere de cada cosa (tabla
 * `follows`, migración 0032). Solo lecturas y escrituras de la base; qué es cada cosa seguida y
 * si se puede seguir lo decide targets.js, y lo puro está en $lib/utils/sigo.js.
 *
 * Lo que nunca se tiene que romper:
 * - lo que sigue una cuenta es **privado**: estas funciones reciben siempre la cuenta y nunca
 *   devuelven lo de otra (no hay lecturas por cosa seguida que digan quién la sigue, salvo las
 *   del cron de mails, que usan el mail de la cuenta y no lo muestran);
 * - no se guarda ningún mail: los avisos van al mail de la cuenta.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import {
	DEFAULT_FOLLOW_OPTIONS,
	MAX_FOLLOWS,
	optionsFromRow,
	telegramOptionsFromRow
} from '$lib/utils/sigo.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/utils/sigo.js').FollowTarget} FollowTarget */
/** @typedef {import('$lib/utils/sigo.js').FollowOptions} FollowOptions */
/**
 * @typedef {{ kind: import('$lib/utils/sigo.js').FollowKind, key: string,
 *   options: FollowOptions, telegram: import('$lib/utils/sigo.js').TelegramOptions,
 *   createdAt: number, seriesSubscriptionId: string | null }} FollowRow `telegram`: los avisos por
 *   Telegram (migración 0033), aparte de `options` porque solo cuentan con un chat vinculado
 */

/** Cambios por cuenta (seguir, dejar de seguir, opciones): no es un mail, pero se topea igual. */
export const FOLLOW_RATE_LIMIT = Object.freeze({ limit: 120, windowSeconds: 60 * 60 });

export const SIGO_MESSAGES = Object.freeze({
	tooMany: 'Hiciste muchos cambios seguidos. Esperá un rato y probá de nuevo.',
	full: `Ya seguís ${MAX_FOLLOWS} cosas: dejá de seguir alguna para sumar otra.`,
	notFound: 'No encontramos eso para seguir.'
});

/**
 * @typedef {{ ok: true, created: boolean } | { ok: false, status: number, message: string }} FollowResult
 */

/**
 * @param {D1Database} db
 * @param {string} accountId
 * @param {number} now
 */
async function withinLimit(db, accountId, now) {
	return (await hitRateLimit(db, `sigo:a:${accountId}`, FOLLOW_RATE_LIMIT, now)).allowed;
}

/**
 * Empieza a seguir algo (ya validado con targets.js). Si ya lo seguía, no cambia nada (sus
 * opciones quedan como estaban) y responde `created: false`.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {FollowTarget} target
 * @param {{ options?: FollowOptions, now?: number, seriesSubscriptionId?: string | null }} [opts]
 * @returns {Promise<FollowResult>}
 */
export async function follow(
	db,
	accountId,
	target,
	{ options = DEFAULT_FOLLOW_OPTIONS, now = Date.now(), seriesSubscriptionId = null } = {}
) {
	if (!(await withinLimit(db, accountId, now)))
		return { ok: false, status: 429, message: SIGO_MESSAGES.tooMany };
	// El tope se mira en la misma sentencia que inserta (dos pedidos a la vez no lo pasan por
	// mucho; alcanza para que nadie llene la tabla).
	const r = await db
		.prepare(
			`INSERT INTO follows (account_id, target_kind, target_key, in_calendar, mail_new,
				mail_reminder, series_subscription_id, created_at, updated_at)
			SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8
			WHERE (SELECT COUNT(*) FROM follows WHERE account_id = ?1) < ?9
			ON CONFLICT (account_id, target_kind, target_key) DO NOTHING`
		)
		.bind(
			accountId,
			target.kind,
			target.key,
			options.calendario ? 1 : 0,
			options.mail_nuevo ? 1 : 0,
			options.recordatorio ? 1 : 0,
			seriesSubscriptionId,
			now,
			MAX_FOLLOWS
		)
		.run();
	if (Number(r.meta?.changes ?? 0) === 1) return { ok: true, created: true };
	if (await getFollow(db, accountId, target)) return { ok: true, created: false };
	return { ok: false, status: 400, message: SIGO_MESSAGES.full };
}

/**
 * Deja de seguir algo (borra la fila). No dice si lo seguía.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {FollowTarget} target
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
export async function unfollow(db, accountId, target, { now = Date.now() } = {}) {
	if (!(await withinLimit(db, accountId, now)))
		return { ok: false, status: 429, message: SIGO_MESSAGES.tooMany };
	await db
		.prepare('DELETE FROM follows WHERE account_id = ?1 AND target_kind = ?2 AND target_key = ?3')
		.bind(accountId, target.kind, target.key)
		.run();
	return { ok: true };
}

/**
 * Cambia las opciones de algo que ya sigue. `{ ok: false, status: 404 }` si no lo sigue. Las de
 * Telegram cambian solo si vienen en `options` (si no, quedan como estaban).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {FollowTarget} target
 * @param {FollowOptions} options
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
export async function setFollowOptions(db, accountId, target, options, { now = Date.now() } = {}) {
	if (!(await withinLimit(db, accountId, now)))
		return { ok: false, status: 429, message: SIGO_MESSAGES.tooMany };
	const r = await db
		.prepare(
			`UPDATE follows SET in_calendar = ?4, mail_new = ?5, mail_reminder = ?6, updated_at = ?7,
				tg_new = coalesce(?8, tg_new), tg_reminder = coalesce(?9, tg_reminder)
			WHERE account_id = ?1 AND target_kind = ?2 AND target_key = ?3`
		)
		.bind(
			accountId,
			target.kind,
			target.key,
			options.calendario ? 1 : 0,
			options.mail_nuevo ? 1 : 0,
			options.recordatorio ? 1 : 0,
			now,
			bit(options.telegram_nuevo),
			bit(options.telegram_recordatorio)
		)
		.run();
	if (Number(r.meta?.changes ?? 0) !== 1)
		return { ok: false, status: 404, message: SIGO_MESSAGES.notFound };
	return { ok: true };
}

/** `undefined` → `null` (no cambiar), si no 1 o 0. @param {boolean | undefined} v */
const bit = (v) => (v === undefined ? null : v ? 1 : 0);

/**
 * @param {Record<string, unknown>} r
 * @returns {FollowRow}
 */
function toRow(r) {
	return {
		kind: /** @type {FollowRow['kind']} */ (String(r.target_kind)),
		key: String(r.target_key),
		options: optionsFromRow(r),
		telegram: telegramOptionsFromRow(r),
		createdAt: Number(r.created_at),
		seriesSubscriptionId: r.series_subscription_id == null ? null : String(r.series_subscription_id)
	};
}

/**
 * Las opciones de algo que sigue la cuenta, o `null` si no lo sigue.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {FollowTarget} target
 * @returns {Promise<FollowRow | null>}
 */
export async function getFollow(db, accountId, target) {
	const r = await db
		.prepare(`SELECT * FROM follows WHERE account_id = ?1 AND target_kind = ?2 AND target_key = ?3`)
		.bind(accountId, target.kind, target.key)
		.first();
	return r ? toRow(r) : null;
}

/**
 * Todo lo que sigue la cuenta (lo más nuevo primero).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<FollowRow[]>}
 */
export async function listFollows(db, accountId) {
	const { results } = await db
		.prepare('SELECT * FROM follows WHERE account_id = ?1 ORDER BY created_at DESC, target_key')
		.bind(accountId)
		.all();
	return results.map(toRow);
}

/**
 * Apaga todos los mails de «Lo que sigo» de la cuenta (el link de baja de los mails). Lo seguido
 * y el calendario quedan como estaban.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ now?: number }} [opts]
 */
export async function stopAllMail(db, accountId, { now = Date.now() } = {}) {
	const r = await db
		.prepare(
			`UPDATE follows SET mail_new = 0, mail_reminder = 0, updated_at = ?2
			WHERE account_id = ?1 AND (mail_new = 1 OR mail_reminder = 1)`
		)
		.bind(accountId, now)
		.run();
	return Number(r.meta?.changes ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Qué más suma el calendario personal (además de lo seguido): en `accounts.preferences`.
// ---------------------------------------------------------------------------------------------

/** @typedef {{ entradas: boolean, participo: boolean }} CalendarPrefs */

/**
 * Las claves de `accounts.preferences`. Sin la clave = prendido (así el calendario sigue
 * mostrando las entradas, como antes de «Lo que sigo»); apagado se guarda `false`.
 */
const PREF_KEYS = Object.freeze({ entradas: 'sigoCalEntradas', participo: 'sigoCalParticipo' });

/**
 * ¿El calendario personal suma mis entradas y los eventos donde participo?
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<CalendarPrefs>}
 */
export async function getCalendarPrefs(db, accountId) {
	const row = await db
		.prepare(
			`SELECT json_extract(preferences, '$.${PREF_KEYS.entradas}') AS entradas,
				json_extract(preferences, '$.${PREF_KEYS.participo}') AS participo
			FROM accounts WHERE id = ?1 AND deleted_at IS NULL`
		)
		.bind(accountId)
		.first();
	return {
		entradas: row?.entradas == null || Number(row.entradas) === 1,
		participo: row?.participo == null || Number(row.participo) === 1
	};
}

/**
 * @param {D1Database} db
 * @param {string} accountId
 * @param {CalendarPrefs} prefs
 * @param {{ now?: number }} [opts]
 */
export async function setCalendarPrefs(db, accountId, prefs, { now = Date.now() } = {}) {
	// Prendido = sin la clave (lo de siempre); apagado = `false`.
	await db
		.prepare(
			`UPDATE accounts SET updated_at = ?2, preferences = json_patch(preferences, json_object(
				'${PREF_KEYS.entradas}', CASE WHEN ?3 THEN NULL ELSE json('false') END,
				'${PREF_KEYS.participo}', CASE WHEN ?4 THEN NULL ELSE json('false') END))
			WHERE id = ?1 AND deleted_at IS NULL`
		)
		.bind(accountId, now, prefs.entradas ? 1 : 0, prefs.participo ? 1 : 0)
		.run();
}

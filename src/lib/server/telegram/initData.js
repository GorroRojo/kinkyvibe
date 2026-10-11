/**
 * Validar el `initData` de una Mini App de Telegram en el servidor (PROTOTIPO de la puerta,
 * decisión 0034; core.telegram.org/bots/webapps, «Validating data received via the Mini App»):
 *
 * 1. `initData` es un query string. Se saca `hash`.
 * 2. data-check-string: **todos los demás campos** recibidos (también `signature`, si viene: las
 *    docs solo lo excluyen en la validación para terceros, la que no usa el token), `clave=valor`,
 *    ordenados por clave y unidos con `\n`.
 * 3. secret_key = HMAC-SHA-256(clave = "WebAppData", mensaje = token del bot).
 * 4. Vale si hex(HMAC-SHA-256(clave = secret_key, mensaje = data-check-string)) == hash
 *    (comparado en tiempo constante).
 * 5. Además se rechaza un `auth_date` viejo (por defecto, más de 1 hora) o del futuro, y un
 *    `initData` con claves repetidas.
 *
 * Nunca loguea ni devuelve el token ni el `initData`.
 */
import { timingSafeEqual } from '$lib/server/hash.js';
import { toHex } from '$lib/utils/base64.js';

/** Cuánto vale un `initData` desde que se abrió la Mini App. */
export const INIT_DATA_MAX_AGE_SEC = 60 * 60;

/** Tolerancia para relojes adelantados. */
const FUTURE_SKEW_SEC = 60;

/** Tamaño máximo aceptado (un initData real pesa menos de 1 KB). */
export const INIT_DATA_MAX_LENGTH = 4096;

/**
 * @param {BufferSource} key
 * @param {string} message
 */
async function hmac(key, message) {
	const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign'
	]);
	return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message)));
}

/**
 * El data-check-string de un `initData` (sin `hash`), o `null` si está roto (claves repetidas,
 * sin hash).
 *
 * @param {string} initData
 * @returns {{ dataCheckString: string, hash: string, fields: Map<string, string> } | null}
 */
export function parseInitData(initData) {
	if (typeof initData !== 'string' || !initData || initData.length > INIT_DATA_MAX_LENGTH) {
		return null;
	}
	const params = new URLSearchParams(initData);
	/** @type {Map<string, string>} */
	const fields = new Map();
	let hash = '';
	for (const [key, value] of params) {
		if (key === 'hash') {
			if (hash) return null;
			hash = value;
			continue;
		}
		if (fields.has(key)) return null;
		fields.set(key, value);
	}
	if (!/^[0-9a-f]{64}$/.test(hash)) return null;
	const dataCheckString = [...fields.keys()]
		.sort()
		.map((k) => `${k}=${fields.get(k)}`)
		.join('\n');
	return { dataCheckString, hash, fields };
}

/**
 * @typedef {{ id: number, first_name?: string, username?: string }} InitDataUser
 * @typedef {{ ok: true, user: InitDataUser, authDate: number }
 *   | { ok: false, reason: 'malformed' | 'bad_hash' | 'stale' | 'no_user' | 'no_token' }} InitDataResult
 */

/**
 * Valida un `initData`.
 *
 * @param {unknown} initData
 * @param {string | undefined} botToken
 * @param {{ now?: number, maxAgeSec?: number }} [opts] `now` en ms
 * @returns {Promise<InitDataResult>}
 */
export async function validateInitData(
	initData,
	botToken,
	{ now = Date.now(), maxAgeSec = INIT_DATA_MAX_AGE_SEC } = {}
) {
	const token = String(botToken ?? '').trim();
	if (!token) return { ok: false, reason: 'no_token' };
	const parsed = parseInitData(/** @type {string} */ (initData));
	if (!parsed) return { ok: false, reason: 'malformed' };
	const secret = await hmac(new TextEncoder().encode('WebAppData'), token);
	const expected = toHex(await hmac(secret, parsed.dataCheckString));
	if (!timingSafeEqual(expected, parsed.hash)) return { ok: false, reason: 'bad_hash' };
	const authDate = Number(parsed.fields.get('auth_date'));
	const nowSec = Math.floor(now / 1000);
	if (
		!Number.isSafeInteger(authDate) ||
		nowSec - authDate > maxAgeSec ||
		authDate - nowSec > FUTURE_SKEW_SEC
	) {
		return { ok: false, reason: 'stale' };
	}
	/** @type {any} */
	let user = null;
	try {
		user = JSON.parse(parsed.fields.get('user') ?? 'null');
	} catch {
		user = null;
	}
	if (!user || !Number.isSafeInteger(user.id) || user.id <= 0)
		return { ok: false, reason: 'no_user' };
	return {
		ok: true,
		user: {
			id: user.id,
			...(typeof user.first_name === 'string' ? { first_name: user.first_name } : {}),
			...(typeof user.username === 'string' ? { username: user.username } : {})
		},
		authDate
	};
}

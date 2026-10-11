/**
 * PROTOTIPO, no para mergear: la puerta (control de ingreso) desde una Mini App de Telegram, con
 * el escáner de QR nativo (`showScanQrPopup`). Ver `docs/telegram.md` («Prototipo: la puerta») y
 * la decisión 0034, que deja las escrituras de la puerta afuera hasta una decisión propia.
 *
 * En **cada pedido**:
 * 1. se valida el `initData` con el token del bot (initData.js: HMAC, `auth_date` de menos de
 *    1 hora);
 * 2. el usuario de Telegram tiene que tener su chat privado vinculado a una cuenta (en un chat
 *    privado, el id del chat es el id del usuario), mirado en la base cada vez;
 * 3. esa cuenta tiene que ser de une admin: hoy las cuentas del público y les admins (GitHub,
 *    `ADMINS` de auth.js) no están unidas, así que el prototipo usa la variable
 *    `TELEGRAM_DOOR_ADMINS` (`<login de GitHub>=<id de la cuenta>`, separados por comas) y
 *    además chequea que ese login siga en `ADMINS`. **Pregunta abierta para gorrite.**
 * 4. el ingreso se marca con las mismas funciones que el modo puerta del panel (`extractToken` +
 *    `checkIn`), con el login de le admin.
 */
import { ADMINS } from '$lib/server/auth';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { extractToken } from '$lib/server/tickets/checkin.js';
import { checkIn } from '$lib/server/tickets/orders.js';
import { chatAccount } from './seguir.js';
import { validateInitData } from './initData.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Escaneos por usuario de Telegram. */
export const DOOR_RATE_LIMIT = Object.freeze({ limit: 600, windowSeconds: 60 * 60 });

/**
 * `TELEGRAM_DOOR_ADMINS` → id de cuenta → login. Ignora lo que no tenga forma.
 *
 * @param {string | undefined} raw
 * @returns {Map<string, string>}
 */
export function parseDoorAdmins(raw) {
	/** @type {Map<string, string>} */
	const out = new Map();
	for (const part of String(raw ?? '').split(',')) {
		const m = /^\s*([A-Za-z0-9-]{1,39})\s*=\s*([A-Za-z0-9-]{8,64})\s*$/.exec(part);
		if (m) out.set(m[2], m[1]);
	}
	return out;
}

/**
 * Le admin detrás de un `initData`, mirado de nuevo en este pedido. `null` si no.
 *
 * @param {{ db: D1Database, initData: unknown, token: string | undefined,
 *   doorAdmins: string | undefined, now?: number }} input
 * @returns {Promise<{ ok: true, login: string, telegramUserId: number }
 *   | { ok: false, reason: string }>}
 */
export async function doorAdmin({ db, initData, token, doorAdmins, now = Date.now() }) {
	const v = await validateInitData(initData, token, { now });
	if (!v.ok) return { ok: false, reason: v.reason };
	const accountId = await chatAccount(db, v.user.id);
	if (!accountId) return { ok: false, reason: 'not_linked' };
	const login = parseDoorAdmins(doorAdmins).get(accountId);
	const admin = login ? ADMINS.find((a) => a.login === login) : undefined;
	if (!admin) return { ok: false, reason: 'not_admin' };
	return { ok: true, login: admin.login, telegramUserId: v.user.id };
}

/**
 * Marca un ingreso desde la Mini App.
 *
 * @param {{ db: D1Database, initData: unknown, token: string | undefined,
 *   doorAdmins: string | undefined, eventSlug: string, code: unknown, now?: number }} input
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function doorCheckIn({ db, initData, token, doorAdmins, eventSlug, code, now }) {
	const who = await doorAdmin({ db, initData, token, doorAdmins, now });
	if (!who.ok) return { status: 403, body: { error: 'forbidden', reason: who.reason } };
	const rate = await hitRateLimit(db, `tg:puerta:${who.telegramUserId}`, DOOR_RATE_LIMIT, now);
	if (!rate.allowed) return { status: 429, body: { error: 'too_many' } };
	const ticketToken = await extractToken(db, eventSlug, code);
	const r = await checkIn(db, { token: ticketToken, eventSlug, by: who.login, now });
	// Solo lo que la pantalla necesita: el resultado y, si es de este evento, el nombre y la hora.
	const sameEvent = r.ticket && r.result !== 'wrong-event';
	return {
		status: 200,
		body: {
			result: r.result,
			...(sameEvent && r.ticket
				? {
						holder: r.ticket.holder_name ?? null,
						checkedInAt: r.ticket.checked_in_at ?? null
					}
				: {})
		}
	};
}

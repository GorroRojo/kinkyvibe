/**
 * La puerta (control de ingreso) desde una Mini App de Telegram, con el escáner de QR nativo
 * (`showScanQrPopup`). Decisión 0037; ver `docs/telegram.md` («La puerta por Telegram»). Sale
 * detrás del interruptor `telegram_puerta` (apagado, decisión 0001), que además pide el bot
 * prendido (`telegram_bot`).
 *
 * En **cada pedido**:
 * 1. se valida el `initData` con el token del bot (initData.js: HMAC, `auth_date` de menos de
 *    1 hora);
 * 2. el usuario de Telegram tiene que estar vinculado a une admin desde el panel (Ajustes →
 *    Admins → «Vincular Telegram», adminLink.js), mirado en la base cada vez;
 * 3. ese login tiene que seguir siendo admin ahora (`isAdmin` de auth.js, con `ADMINS`): sacar a
 *    alguien de la lista le corta la puerta aunque el vínculo siga en la base;
 * 4. el ingreso se marca con las mismas funciones que el modo puerta del panel (`extractToken` +
 *    `checkIn`), con el login de le admin.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { extractToken } from '$lib/server/tickets/checkin.js';
import { checkIn } from '$lib/server/tickets/orders.js';
import { isAdmin } from '$lib/server/auth';
import { isFlagOn } from '$lib/server/flags.js';
import { linkedAdmin } from './adminLink.js';
import { validateInitData } from './initData.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * ¿Está prendida la puerta por Telegram? Pide los dos interruptores: el del bot y el de la puerta.
 *
 * @param {D1Database | null | undefined} db
 */
export async function doorEnabled(db) {
	if (!db) return false;
	const [bot, door] = await Promise.all([
		isFlagOn(db, 'telegram_bot'),
		isFlagOn(db, 'telegram_puerta')
	]);
	return bot && door;
}

/** Escaneos por usuario de Telegram. */
export const DOOR_RATE_LIMIT = Object.freeze({ limit: 600, windowSeconds: 60 * 60 });

/**
 * Le admin detrás de un `initData`, mirado de nuevo en este pedido. `null` si no.
 *
 * @param {{ db: D1Database, initData: unknown, token: string | undefined, now?: number }} input
 * @returns {Promise<{ ok: true, login: string, telegramUserId: number }
 *   | { ok: false, reason: string }>}
 */
export async function doorAdmin({ db, initData, token, now = Date.now() }) {
	const v = await validateInitData(initData, token, { now });
	if (!v.ok) return { ok: false, reason: v.reason };
	const admin = await linkedAdmin(db, v.user.id);
	if (!admin) return { ok: false, reason: 'not_linked' };
	if (!isAdmin(admin)) return { ok: false, reason: 'not_admin' };
	return { ok: true, login: admin.login, telegramUserId: v.user.id };
}

/**
 * Marca un ingreso desde la Mini App.
 *
 * @param {{ db: D1Database, initData: unknown, token: string | undefined,
 *   eventSlug: string, code: unknown, now?: number }} input
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function doorCheckIn({ db, initData, token, eventSlug, code, now }) {
	const who = await doorAdmin({ db, initData, token, now });
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

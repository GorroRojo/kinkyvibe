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
 *
 * Avisos de puerta (decisión 0051, $lib/server/tickets/doorNotices.js): en un evento de Kinky Vibe,
 * si la entrada coincide con un aviso, la respuesta lleva `notice: true` y la Mini App muestra solo
 * «Avisá a la organización antes de dejar pasar». El ingreso se marca igual.
 *
 * La lista de eventos para elegir (`doorEvents`) pide lo mismo (1 a 3) y sale de lo mismo que
 * /admin/checkin (`listTicketedEvents` + `checkinGroup`): los de hoy y los de los próximos días.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { extractToken } from '$lib/server/tickets/checkin.js';
import { checkIn } from '$lib/server/tickets/orders.js';
import { checkinGroup, ticketWithBuyer } from '$lib/server/tickets/door.js';
import { doorNoticeMatcher, isKinkyVibeDoor } from '$lib/server/tickets/doorNotices.js';
import { getEventTickets, listTicketedEvents } from '$lib/server/tickets/events.js';
import { toTime } from '$lib/server/tickets/config.js';
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
	const who = await linkedDoorAdmin(db, v.user.id);
	if (!who.ok) return who;
	return { ok: true, login: who.login, telegramUserId: v.user.id };
}

/**
 * Le admin vinculade a este usuario de Telegram, si **sigue** en `ADMINS`. Una sola consulta (por
 * el id del usuario de Telegram); `isAdmin` no toca la base.
 *
 * @param {D1Database} db
 * @param {number} telegramUserId
 * @returns {Promise<{ ok: true, login: string } | { ok: false, reason: 'not_linked' | 'not_admin' }>}
 */
export async function linkedDoorAdmin(db, telegramUserId) {
	const admin = await linkedAdmin(db, telegramUserId);
	if (!admin) return { ok: false, reason: 'not_linked' };
	if (!isAdmin(admin)) return { ok: false, reason: 'not_admin' };
	return { ok: true, login: admin.login };
}

/**
 * Lo que usa el bot para el botón «🚪 Puerta» del inicio (router.js no sabe de la base): ¿este
 * usuario de Telegram puede abrir la puerta? Se pasa solo con los dos interruptores prendidos.
 *
 * @param {D1Database} db
 * @returns {import('./router.js').BotDoor}
 */
export function botDoor(db) {
	return async (telegramUserId) => (await linkedDoorAdmin(db, telegramUserId)).ok;
}

/**
 * Marca un ingreso desde la Mini App.
 *
 * `eventConfig`: de dónde sale la configuración del evento (para saber si es de Kinky Vibe); los
 * tests la reemplazan.
 *
 * @param {{ db: D1Database, initData: unknown, token: string | undefined,
 *   eventSlug: string, code: unknown, now?: number,
 *   eventConfig?: (slug: string) => Promise<{ fondoEnabled?: boolean } | null> }} input
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function doorCheckIn({
	db,
	initData,
	token,
	eventSlug,
	code,
	now,
	eventConfig = getEventTickets
}) {
	const who = await doorAdmin({ db, initData, token, now });
	if (!who.ok) return { status: 403, body: { error: 'forbidden', reason: who.reason } };
	const rate = await hitRateLimit(db, `tg:puerta:${who.telegramUserId}`, DOOR_RATE_LIMIT, now);
	if (!rate.allowed) return { status: 429, body: { error: 'too_many' } };
	const ticketToken = await extractToken(db, eventSlug, code);
	const r = await checkIn(db, { token: ticketToken, eventSlug, by: who.login, now });
	// Solo lo que la pantalla necesita: el resultado y, si es de este evento, el nombre, la hora y
	// si coincide con un aviso de puerta (solo sí; nunca el motivo).
	const sameEvent = r.ticket && r.result !== 'wrong-event';
	const notice = sameEvent && r.ticket ? await ticketNotice(db, eventSlug, r.ticket.id, eventConfig, now) : false;
	return {
		status: 200,
		body: {
			result: r.result,
			...(sameEvent && r.ticket
				? {
						holder: r.ticket.holder_name ?? null,
						checkedInAt: r.ticket.checked_in_at ?? null,
						...(notice ? { notice: true } : {})
					}
				: {})
		}
	};
}

/**
 * ¿La entrada coincide con un aviso de puerta vigente? Solo en eventos de Kinky Vibe; si algo
 * falla, no (la puerta sigue andando).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} ticketId
 * @param {(slug: string) => Promise<{ fondoEnabled?: boolean } | null>} eventConfig
 * @param {number} [now]
 */
async function ticketNotice(db, eventSlug, ticketId, eventConfig, now = Date.now()) {
	try {
		const config = await eventConfig(eventSlug);
		if (!isKinkyVibeDoor(config)) return false;
		const [full, notices] = await Promise.all([
			ticketWithBuyer(db, { id: ticketId }),
			doorNoticeMatcher(db, { kinkyVibe: true, now })
		]);
		return full ? await notices(full) : false;
	} catch (error) {
		console.error('[puerta] avisos de puerta:', String(error).slice(0, 200));
		return false;
	}
}

/** Cuántos días para adelante entran en la lista, además de los de hoy. */
export const DOOR_EVENTS_DAYS = 3;

/** Tope de eventos en la lista (el resto, escribiendo la dirección). */
export const DOOR_EVENTS_MAX = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {{ slug: string, title: string, start: number, today: boolean }} DoorEventChoice
 */

/**
 * Los eventos para elegir en la puerta: los de hoy (el mismo día en Argentina o que empezaron hace
 * menos de 12 horas, como /admin/checkin) y los de los próximos `DOOR_EVENTS_DAYS` días, del más
 * cercano al más lejano. Sin los online. Solo dirección, título y comienzo. Pura (para los tests).
 *
 * @param {{ slug: string, config: { title?: string, start?: unknown, online?: boolean } }[]} events
 * @param {number} now
 * @returns {DoorEventChoice[]}
 */
export function doorEventChoices(events, now) {
	/** @type {DoorEventChoice[]} */
	const out = [];
	for (const { slug, config } of events) {
		if (config.online) continue;
		const start = toTime(config.start);
		if (start === null) continue;
		const group = checkinGroup(start, now);
		const soon = group === 'proximos' && start - now <= DOOR_EVENTS_DAYS * DAY_MS;
		if (group !== 'hoy' && !soon) continue;
		out.push({ slug, title: String(config.title || slug), start, today: group === 'hoy' });
	}
	return out.sort((a, b) => a.start - b.start).slice(0, DOOR_EVENTS_MAX);
}

/**
 * La lista de eventos de la Mini App, con los mismos permisos que marcar un ingreso.
 *
 * @param {{ db: D1Database, initData: unknown, token: string | undefined, now?: number,
 *   list?: () => Promise<{ slug: string, config: { title?: string, start?: unknown,
 *   online?: boolean } }[]> }} input `list`: de dónde salen (para los tests)
 * @returns {Promise<{ status: number, body: Record<string, unknown> }>}
 */
export async function doorEvents({ db, initData, token, now = Date.now(), list }) {
	const who = await doorAdmin({ db, initData, token, now });
	if (!who.ok) return { status: 403, body: { error: 'forbidden', reason: who.reason } };
	const events = await (list ?? listTicketedEvents)();
	return { status: 200, body: { events: doorEventChoices(events, now) } };
}

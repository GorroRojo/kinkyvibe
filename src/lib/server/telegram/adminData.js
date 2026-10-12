/**
 * «📊 Estado» y «🔔 Mis avisos» para admins en el bot (decisión 0041, docs/telegram.md «Estado y
 * avisos para admins»): lo que necesita de la base. router.js no sabe de la base: usa
 * {@link botAdmin}.
 *
 * - **Quién**: el mismo vínculo que la puerta por Telegram (decisión 0037, adminLink.js) y la lista
 *   `ADMINS` (`isAdmin`), mirados **en cada mensaje y cada botón**: sacar a alguien de la lista le
 *   corta el estado aunque el vínculo siga en la base.
 * - **Estado**: solo cantidades (consultas con `SUM`/`COUNT`, nunca columnas de compradores: ni
 *   nombres, ni mails, ni DNI, ni teléfonos). Lo de cada compra queda en el panel.
 * - **Mis avisos**: qué avisos eligió cada admin (migración 0054). Vienen apagados (sin fila =
 *   apagado). Por ahora solo se guardan: los mandan los PR siguientes (decisión 0041).
 */
import { isAdmin } from '$lib/server/auth';
import { isFlagOn } from '$lib/server/flags.js';
import { HOLDING } from '$lib/server/tickets/discounts.js';
import { checkinGroup } from '$lib/server/tickets/door.js';
import { getEventTickets, listTicketedEvents } from '$lib/server/tickets/events.js';
import { toTime } from '$lib/server/tickets/config.js';
import { currentTier, tierKey } from '$lib/utils/ticketTiers.js';
import { linkedAdmin } from './adminLink.js';
import { NOTICE_KINDS } from './adminNav.js';
import { shortHash } from './nav.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./adminNav.js').NoticeKind} NoticeKind */
/** @typedef {import('./adminLink.js').AdminIdentity} AdminIdentity */

/**
 * ¿Están prendidos el estado y los avisos para admins? Pide el bot y `telegram_admin`.
 *
 * @param {D1Database | null | undefined} db
 */
export async function adminBotEnabled(db) {
	if (!db) return false;
	const [bot, admin] = await Promise.all([
		isFlagOn(db, 'telegram_bot'),
		isFlagOn(db, 'telegram_admin')
	]);
	return bot && admin;
}

/**
 * Le admin vinculade a este usuario de Telegram, si **sigue** en `ADMINS`; si no, `null`.
 *
 * @param {D1Database} db
 * @param {number} telegramUserId
 * @returns {Promise<AdminIdentity | null>}
 */
export async function linkedBotAdmin(db, telegramUserId) {
	const admin = await linkedAdmin(db, telegramUserId);
	return admin && isAdmin(admin) ? admin : null;
}

// ---------------------------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------------------------

/** Hasta cuántos eventos entran en la lista de «📊 Estado». */
export const ADMIN_EVENTS_MAX = 30;

/** «Por vencer»: reservas sin pagar que vencen dentro de esta ventana. */
export const EXPIRING_MS = 60 * 60 * 1000;

/**
 * Un evento para elegir en «📊 Estado». `hash`: el de su botón (`shortHash` de la dirección).
 *
 * @typedef {{ slug: string, hash: string, title: string, start: string, today: boolean,
 *   cancelled: boolean }} AdminEventChoice
 */

/**
 * Los eventos con entradas de hoy (como el modo puerta: el mismo día en Argentina o que empezaron
 * hace menos de 12 horas) y los que vienen, del más cercano al más lejano, hasta
 * {@link ADMIN_EVENTS_MAX}. También los no listados y los cancelados (une admin los quiere ver).
 * Pura (para los tests).
 *
 * @param {{ slug: string, config: { title?: string, start?: unknown, status?: string } }[]} events
 * @param {number} now
 * @returns {AdminEventChoice[]}
 */
export function adminEventChoices(events, now) {
	/** @type {(AdminEventChoice & { ms: number })[]} */
	const out = [];
	for (const { slug, config } of events) {
		const ms = toTime(config.start);
		if (ms === null) continue;
		const group = checkinGroup(ms, now);
		if (group !== 'hoy' && group !== 'proximos') continue;
		out.push({
			slug,
			hash: shortHash(slug),
			title: String(config.title || slug),
			start: new Date(ms).toISOString(),
			today: group === 'hoy',
			cancelled: config.status === 'cancelled',
			ms
		});
	}
	return out
		.sort((a, b) => a.ms - b.ms)
		.slice(0, ADMIN_EVENTS_MAX)
		.map(({ ms: _ms, ...choice }) => choice);
}

/**
 * Lo de un tramo de precio: cuántas se vendieron (aprobadas), de cuántas (`null` = sin cantidad) y
 * si es el que se vende ahora.
 *
 * @typedef {{ id: string, name: string, sold: number, quantity: number | null,
 *   current: boolean }} TierStatus
 */

/**
 * Lo de un tipo de entrada: vendidas (aprobadas), reservadas sin pagar y el cupo (`null` = sin
 * cupo).
 *
 * @typedef {{ id: string, name: string, sold: number, held: number, capacity: number | null,
 *   tiers: TierStatus[] }} TypeStatus
 */

/**
 * El estado de la venta de un evento: solo cantidades.
 *
 * - `held`: entradas reservadas sin pagar (Mercado Pago en curso o transferencia esperando), que
 *   todavía cuentan para el cupo; `expiring`: las que vencen en la próxima hora.
 * - `transfers`: órdenes esperando que se confirme la transferencia.
 * - `review`: órdenes marcadas para revisar.
 * - `waitlist`: personas en la lista de espera, o `null` si esa tabla todavía no existe.
 *
 * @typedef {{ types: TypeStatus[], sold: number, capacity: number | null, held: number,
 *   expiring: number, transfers: number, review: number, waitlist: number | null }} EventStatus
 */

/**
 * Cuántas personas hay en la lista de espera del evento (esperando o con una oferta abierta), o
 * `null` si la tabla `waitlist_entries` (lista de espera, migración 0053) todavía no existe o no se pudo
 * leer.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<number | null>}
 */
async function waitlistCount(db, slug) {
	try {
		const table = await db
			.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?1")
			.bind('waitlist_entries')
			.first();
		if (!table) return null;
		const row = await db
			.prepare(
				`SELECT COUNT(*) AS n FROM waitlist_entries
				WHERE event_slug = ?1 AND status IN ('waiting', 'offered')`
			)
			.bind(slug)
			.first();
		return Number(row?.n ?? 0);
	} catch (error) {
		console.error(
			'[telegram] estado: no se pudo leer la lista de espera',
			/** @type {Error} */ (error)?.name
		);
		return null;
	}
}

/**
 * El estado de la venta de un evento (ver {@link EventStatus}). Dos consultas de cantidades sobre
 * `orders` y, si existe, una sobre la lista de espera.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @param {{ types: import('$lib/server/tickets/config.js').TicketType[] }} config
 * @param {number} now
 * @returns {Promise<EventStatus>}
 */
export async function eventStatus(db, slug, config, now) {
	const { results } = await db
		.prepare(
			`SELECT ticket_type, ticket_tier,
				SUM(CASE WHEN status = 'approved' THEN quantity ELSE 0 END) AS sold,
				SUM(CASE WHEN status IN ${HOLDING} AND expires_at > ?2 THEN quantity ELSE 0 END) AS held,
				SUM(CASE WHEN status IN ${HOLDING} AND expires_at > ?2 AND expires_at <= ?3
					THEN quantity ELSE 0 END) AS expiring
			FROM orders WHERE event_slug = ?1 GROUP BY ticket_type, ticket_tier`
		)
		.bind(slug, now, now + EXPIRING_MS)
		.all();
	const pending = await db
		.prepare(
			`SELECT
				COUNT(CASE WHEN status = 'awaiting_transfer' THEN 1 END) AS transfers,
				COUNT(CASE WHEN needs_review IS NOT NULL THEN 1 END) AS review
			FROM orders WHERE event_slug = ?1`
		)
		.bind(slug)
		.first();

	/** @type {Map<string, { sold: number, held: number }>} */
	const byType = new Map();
	/** @type {Map<string, number>} */
	const soldByTier = new Map();
	/** Lo tomado (aprobadas + reservas vigentes), para saber el tramo vigente. */
	const taken = { types: new Map(), tiers: new Map() };
	let expiring = 0;
	for (const r of results) {
		const type = String(r.ticket_type);
		const sold = Number(r.sold ?? 0);
		const held = Number(r.held ?? 0);
		expiring += Number(r.expiring ?? 0);
		const t = byType.get(type) ?? { sold: 0, held: 0 };
		byType.set(type, { sold: t.sold + sold, held: t.held + held });
		taken.types.set(type, (taken.types.get(type) ?? 0) + sold + held);
		if (r.ticket_tier !== null && r.ticket_tier !== undefined) {
			const key = tierKey(type, String(r.ticket_tier));
			soldByTier.set(key, (soldByTier.get(key) ?? 0) + sold);
			taken.tiers.set(key, (taken.tiers.get(key) ?? 0) + sold + held);
		}
	}

	/** @type {TypeStatus[]} */
	const types = config.types.map((type) => {
		const counts = byType.get(type.id) ?? { sold: 0, held: 0 };
		const current = type.tiers?.length ? currentTier(type, taken, now) : null;
		return {
			id: type.id,
			name: type.name,
			sold: counts.sold,
			held: counts.held,
			capacity: type.capacity ?? null,
			tiers: (type.tiers ?? []).map((tier) => ({
				id: tier.id,
				name: tier.name,
				sold: soldByTier.get(tierKey(type.id, tier.id)) ?? 0,
				quantity: tier.quantity,
				current: current?.tier.id === tier.id
			}))
		};
	});
	// Las vendidas de tipos que ya no están en la configuración igual suman al total.
	let sold = 0;
	let held = 0;
	for (const counts of byType.values()) {
		sold += counts.sold;
		held += counts.held;
	}
	const capacity = types.every((t) => t.capacity !== null)
		? types.reduce((sum, t) => sum + /** @type {number} */ (t.capacity), 0)
		: null;
	return {
		types,
		sold,
		capacity,
		held,
		expiring,
		transfers: Number(pending?.transfers ?? 0),
		review: Number(pending?.review ?? 0),
		waitlist: await waitlistCount(db, slug)
	};
}

// ---------------------------------------------------------------------------------------------
// Mis avisos
// ---------------------------------------------------------------------------------------------

/** @param {unknown} kind @returns {kind is NoticeKind} */
export const isNoticeKind = (kind) => NOTICE_KINDS.includes(/** @type {NoticeKind} */ (kind));

/**
 * Los avisos que prendió le admin (los que no conoce el código, no).
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @returns {Promise<Set<NoticeKind>>}
 */
export async function adminNotices(db, githubId) {
	const { results } = await db
		.prepare('SELECT kind FROM telegram_admin_notices WHERE github_id = ?1')
		.bind(githubId)
		.all();
	return new Set(results.map((r) => r.kind).filter(isNoticeKind));
}

/**
 * Prende o apaga un aviso de le admin. Idempotente. Devuelve cómo quedaron todos.
 *
 * @param {D1Database} db
 * @param {number} githubId
 * @param {NoticeKind} kind
 * @param {boolean} on
 * @param {{ now?: number }} [opts]
 * @returns {Promise<Set<NoticeKind>>}
 */
export async function setAdminNotice(db, githubId, kind, on, { now = Date.now() } = {}) {
	if (!Number.isSafeInteger(githubId) || !isNoticeKind(kind)) throw new Error('aviso inválido');
	await (
		on
			? db
					.prepare(
						`INSERT INTO telegram_admin_notices (github_id, kind, created_at) VALUES (?1, ?2, ?3)
						ON CONFLICT (github_id, kind) DO NOTHING`
					)
					.bind(githubId, kind, now)
			: db
					.prepare('DELETE FROM telegram_admin_notices WHERE github_id = ?1 AND kind = ?2')
					.bind(githubId, kind)
	).run();
	return adminNotices(db, githubId);
}

/**
 * A quién mandarle un tipo de aviso (para los PR siguientes): les admins que lo prendieron, con el
 * Telegram vinculado y que **siguen** en `ADMINS`. El chat privado con el bot tiene el mismo id
 * que el usuario de Telegram.
 *
 * @param {D1Database} db
 * @param {NoticeKind} kind
 * @returns {Promise<{ telegramUserId: string, githubId: number, login: string }[]>}
 */
export async function noticeRecipients(db, kind) {
	if (!isNoticeKind(kind)) return [];
	const { results } = await db
		.prepare(
			`SELECT l.telegram_user_id, l.github_id, l.github_login
			FROM telegram_admin_notices n
			JOIN telegram_admin_links l ON l.github_id = n.github_id
			WHERE n.kind = ?1 ORDER BY l.github_id`
		)
		.bind(kind)
		.all();
	return results
		.map((r) => ({
			telegramUserId: String(r.telegram_user_id),
			githubId: Number(r.github_id),
			login: String(r.github_login)
		}))
		.filter((r) => isAdmin({ id: r.githubId, login: r.login }));
}

// ---------------------------------------------------------------------------------------------
// Lo que usa el bot
// ---------------------------------------------------------------------------------------------

/**
 * Lo que el router puede hacer para admins (router.js no sabe de la base). Se pasa solo con
 * {@link adminBotEnabled}.
 *
 * - `who`: le admin de este usuario de Telegram (vínculo + `ADMINS`), o `null`. El router lo llama
 *   en cada mensaje y cada botón de admins.
 * - `events`: los eventos para elegir; `status`: el estado de uno de esos (`null` si ya no vende
 *   entradas).
 * - `notices` / `setNotice`: «🔔 Mis avisos».
 *
 * @typedef {{
 *   who: (telegramUserId: number) => Promise<AdminIdentity | null>,
 *   events: (now: number) => Promise<AdminEventChoice[]>,
 *   status: (slug: string, now: number) => Promise<EventStatus | null>,
 *   notices: (githubId: number) => Promise<Set<NoticeKind>>,
 *   setNotice: (githubId: number, kind: NoticeKind, on: boolean) => Promise<Set<NoticeKind>>
 * }} BotAdmin
 */

/**
 * @param {D1Database} db
 * @param {{ list?: typeof listTicketedEvents, config?: typeof getEventTickets }} [sources] de
 *   dónde salen los eventos (para los tests)
 * @returns {BotAdmin}
 */
export function botAdmin(db, { list = listTicketedEvents, config = getEventTickets } = {}) {
	return {
		who: (telegramUserId) => linkedBotAdmin(db, telegramUserId),
		events: async (now) => adminEventChoices(await list(), now),
		status: async (slug, now) => {
			const tickets = await config(slug);
			return tickets ? eventStatus(db, slug, tickets, now) : null;
		},
		notices: (githubId) => adminNotices(db, githubId),
		setNotice: (githubId, kind, on) => setAdminNotice(db, githubId, kind, on)
	};
}

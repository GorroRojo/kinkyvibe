/**
 * Datos del Inicio del panel (/admin): eventos próximos con sus números, "para revisar", plata
 * del mes, actividad y "desde tu última visita".
 *
 * Todo es a prueba de fallas: sin base de datos (o con un error en una consulta) cada parte
 * devuelve vacío y el Inicio muestra su estado vacío en lugar de romperse. Solo lo ven admins,
 * así que la actividad muestra nombres de compradores (decisión de gorrite, Q17), pero nunca DNI
 * ni tokens: las consultas no los piden.
 */
import { logDBError } from '$lib/server/db';
import { orderReference } from '$lib/utils/tickets.js';
import {
	describeReminder,
	dueReminderOrders,
	failedReminderCounts,
	reminderDueAt,
	reminderId
} from '$lib/server/tickets/reminders.js';
import { failedStreamLinkCounts } from '$lib/server/tickets/stream.js';
import { lastIntegrityRun } from '$lib/server/objects/integrity.js';
import { accountHref, profileHref, PROFILES_TO_REVIEW_HREF } from '$lib/admin/links.js';
import { ACCOUNT_EVENT_ACTIONS } from './accountEvents.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/eventos/index.js').EventSummary} EventSummary */
/** @typedef {import('$lib/server/tickets/config.js').EventTickets} EventTickets */

/** Argentina: UTC-3 todo el año. */
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
/** Una orden aprobada sin mail recién cuenta como problema después de esto (el envío es async). */
export const EMAIL_GRACE_MS = 10 * 60 * 1000;
/** Un recordatorio que debió salir hace más de esto y no salió cuenta como fallido. */
export const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * `YYYY-MM-DD` en hora de Argentina.
 * @param {number | string | Date} t
 */
export function arDay(t) {
	const ms = new Date(t).getTime();
	return Number.isFinite(ms) ? new Date(ms + AR_OFFSET_MS).toISOString().slice(0, 10) : '';
}

/**
 * Medianoche (Argentina) del día de `now`, en ms.
 * @param {number} now
 */
export function arDayStart(now) {
	const d = new Date(now + AR_OFFSET_MS);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - AR_OFFSET_MS;
}

/**
 * Mes calendario (Argentina) que contiene `now`: `{ start, end }` en ms (fin exclusivo).
 * @param {number} now
 */
export function arMonthWindow(now) {
	const d = new Date(now + AR_OFFSET_MS);
	const y = d.getUTCFullYear();
	const m = d.getUTCMonth();
	return {
		start: Date.UTC(y, m, 1) - AR_OFFSET_MS,
		end: Date.UTC(m === 11 ? y + 1 : y, (m + 1) % 12, 1) - AR_OFFSET_MS
	};
}

/**
 * Corre una consulta y devuelve `fallback` si no hay base o si falla.
 * @template T
 * @param {D1Database | null | undefined} db
 * @param {string} what
 * @param {T} fallback
 * @param {(db: D1Database) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function safe(db, what, fallback, fn) {
	if (!db) return fallback;
	try {
		return await fn(db);
	} catch (error) {
		logDBError(`inicio: ${what}`, error);
		return fallback;
	}
}

/**
 * @param {string[]} slugs
 */
const placeholders = (slugs) => slugs.map(() => '?').join(', ');

/**
 * @typedef {{ sold: number, held: number, revenue: number, fondo: number, contribution: number }} TypeTotals
 */

/**
 * Totales por evento y tipo de entrada (una sola consulta para todos los eventos).
 *
 * @param {D1Database | null | undefined} db
 * @param {string[]} slugs
 * @param {number} now
 * @returns {Promise<Map<string, Map<string, TypeTotals>>>}
 */
export function ticketTotals(db, slugs, now) {
	return safe(db, 'totales por evento', new Map(), async (db) => {
		/** @type {Map<string, Map<string, TypeTotals>>} */
		const out = new Map();
		if (!slugs.length) return out;
		const { results } = await db
			.prepare(
				`SELECT event_slug, ticket_type,
					SUM(CASE WHEN status = 'approved' THEN quantity ELSE 0 END) AS sold,
					SUM(CASE WHEN status IN ('pending', 'rejected', 'awaiting_transfer') AND expires_at > ?
						THEN quantity ELSE 0 END) AS held,
					SUM(CASE WHEN status = 'approved' THEN total ELSE 0 END) AS revenue,
					SUM(CASE WHEN status = 'approved' THEN fondo_amount ELSE 0 END) AS fondo,
					SUM(CASE WHEN status = 'approved' THEN fondo_contribution ELSE 0 END) AS contribution
				FROM orders WHERE event_slug IN (${placeholders(slugs)})
				GROUP BY event_slug, ticket_type`
			)
			.bind(now, ...slugs)
			.all();
		for (const r of results) {
			const slug = String(r.event_slug);
			if (!out.has(slug)) out.set(slug, new Map());
			out.get(slug)?.set(String(r.ticket_type), {
				sold: Number(r.sold ?? 0),
				held: Number(r.held ?? 0),
				revenue: Number(r.revenue ?? 0),
				fondo: Number(r.fondo ?? 0),
				contribution: Number(r.contribution ?? 0)
			});
		}
		return out;
	});
}

/**
 * Entradas emitidas e ingresadas por evento (para la tarjeta "Hoy").
 *
 * @param {D1Database | null | undefined} db
 * @param {string[]} slugs
 * @returns {Promise<Map<string, { tickets: number, checkedIn: number }>>}
 */
export function checkinTotals(db, slugs) {
	return safe(db, 'ingresos', new Map(), async (db) => {
		/** @type {Map<string, { tickets: number, checkedIn: number }>} */
		const out = new Map();
		if (!slugs.length) return out;
		const { results } = await db
			.prepare(
				`SELECT t.event_slug, COUNT(*) AS tickets,
					SUM(CASE WHEN t.checked_in_at IS NOT NULL THEN 1 ELSE 0 END) AS checked_in
				FROM tickets t JOIN orders o ON o.id = t.order_id
				WHERE o.status = 'approved' AND t.event_slug IN (${placeholders(slugs)})
				GROUP BY t.event_slug`
			)
			.bind(...slugs)
			.all();
		for (const r of results) {
			out.set(String(r.event_slug), {
				tickets: Number(r.tickets ?? 0),
				checkedIn: Number(r.checked_in ?? 0)
			});
		}
		return out;
	});
}

/**
 * Transferencias esperando confirmación (vigentes), por evento, con el vencimiento más cercano.
 *
 * @param {D1Database | null | undefined} db
 * @param {number} now
 * @returns {Promise<{ slug: string, count: number, oldestExpiry: number }[]>}
 */
export function pendingTransfers(db, now) {
	return safe(db, 'transferencias', [], async (db) => {
		const { results } = await db
			.prepare(
				`SELECT event_slug, COUNT(*) AS n, MIN(expires_at) AS oldest FROM orders
				WHERE status = 'awaiting_transfer' AND expires_at > ?
				GROUP BY event_slug ORDER BY oldest`
			)
			.bind(now)
			.all();
		return results.map((r) => ({
			slug: String(r.event_slug),
			count: Number(r.n),
			oldestExpiry: Number(r.oldest)
		}));
	});
}

/**
 * Órdenes aprobadas cuyo mail con las entradas no salió (`email_sent_at` vacío), más viejas que
 * {@link EMAIL_GRACE_MS}.
 *
 * @param {D1Database | null | undefined} db
 * @param {number} now
 * @returns {Promise<{ id: string, ref: string, slug: string, buyerName: string, at: number }[]>}
 */
export function unsentEmails(db, now) {
	return safe(db, 'mails sin enviar', [], async (db) => {
		const { results } = await db
			.prepare(
				`SELECT id, event_slug, buyer_name, updated_at FROM orders
				WHERE status = 'approved' AND email_sent_at IS NULL AND updated_at < ?
				ORDER BY updated_at DESC LIMIT 20`
			)
			.bind(now - EMAIL_GRACE_MS)
			.all();
		return results.map((r) => ({
			id: String(r.id),
			ref: orderReference(String(r.id)),
			slug: String(r.event_slug),
			buyerName: String(r.buyer_name),
			at: Number(r.updated_at)
		}));
	});
}

/**
 * Órdenes marcadas para revisar a mano (pago tardío o duplicado).
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<{ id: string, ref: string, slug: string, reason: string, buyerName: string }[]>}
 */
export function reviewOrders(db) {
	return safe(db, 'órdenes para revisar', [], async (db) => {
		const { results } = await db
			.prepare(
				`SELECT id, event_slug, needs_review, buyer_name FROM orders
				WHERE needs_review IS NOT NULL ORDER BY updated_at DESC LIMIT 50`
			)
			.all();
		return results.map((r) => ({
			id: String(r.id),
			ref: orderReference(String(r.id)),
			slug: String(r.event_slug),
			reason: String(r.needs_review),
			buyerName: String(r.buyer_name)
		}));
	});
}

/**
 * Eventos (de la lista) que ya tienen cargado el link de la transmisión.
 *
 * @param {D1Database | null | undefined} db
 * @param {string[]} slugs
 * @returns {Promise<Set<string>>}
 */
export function streamLinkSlugs(db, slugs) {
	return safe(db, 'links de transmisión', new Set(), async (db) => {
		if (!slugs.length) return new Set();
		const { results } = await db
			.prepare(
				`SELECT event_slug FROM event_ticket_settings
				WHERE stream_link IS NOT NULL AND stream_link != '' AND event_slug IN (${placeholders(slugs)})`
			)
			.bind(...slugs)
			.all();
		return new Set(results.map((r) => String(r.event_slug)));
	});
}

/**
 * Recordatorios que ya tendrían que haber salido (hace más de {@link REMINDER_GRACE_MS}) y no
 * salieron: cuántas órdenes por evento. Usa la misma cuenta que el cron de recordatorios.
 *
 * @param {D1Database | null | undefined} db
 * @param {{
 *   events: { slug: string, start: number, reminders: boolean, cancelled: boolean }[],
 *   reminders: import('$lib/server/tickets/reminders.js').Reminder[],
 *   now: number
 * }} input
 * @returns {Promise<Map<string, number>>}
 */
export function failedReminders(db, { events, reminders, now }) {
	return safe(db, 'recordatorios', new Map(), async (db) => {
		/** @type {Map<string, number>} */
		const out = new Map();
		const late = await dueReminderOrders(db, { events, reminders, now: now - REMINDER_GRACE_MS });
		for (const { slug } of late) out.set(slug, (out.get(slug) ?? 0) + 1);
		return out;
	});
}

/**
 * Envíos masivos que se rindieron (fallaron todos sus intentos; ver tickets/sendState.js), por
 * evento: recordatorios y link de la transmisión (el actual). No se reintentan solos.
 *
 * @param {D1Database | null | undefined} db
 * @param {string[]} slugs
 * @returns {Promise<{ reminders: Map<string, number>, streamLinks: Map<string, number> }>}
 */
export function stuckSends(db, slugs) {
	return safe(
		db,
		'envíos fallidos',
		{ reminders: new Map(), streamLinks: new Map() },
		async (db) => ({
			reminders: await failedReminderCounts(db, slugs),
			streamLinks: await failedStreamLinkCounts(db, slugs)
		})
	);
}

/**
 * La última corrida del chequeo nocturno de integridad de los objetos (null si no hubo ninguna
 * o si la base todavía no tiene la migración 0012).
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<import('$lib/server/objects/integrity.js').IntegrityRun | null>}
 */
export function integrityRun(db) {
	return safe(db, 'chequeo nocturno', null, lastIntegrityRun);
}

/**
 * Plata de entradas del mes calendario en curso (hora de Argentina): lo cobrado en órdenes
 * aprobadas creadas este mes, cuántas órdenes y entradas, y el neto del Fondo en entradas
 * (aportes − lo que cubrió).
 *
 * @param {D1Database | null | undefined} db
 * @param {number} now
 * @returns {Promise<{ start: number, total: number, orders: number, tickets: number, fondoNet: number } | null>}
 */
export function monthMoney(db, now) {
	return safe(db, 'plata del mes', null, async (db) => {
		const { start, end } = arMonthWindow(now);
		const row = await db
			.prepare(
				`SELECT COUNT(*) AS orders, COALESCE(SUM(quantity), 0) AS tickets,
					COALESCE(SUM(total), 0) AS total,
					COALESCE(SUM(fondo_contribution - fondo_amount), 0) AS fondo_net
				FROM orders WHERE status = 'approved' AND created_at >= ? AND created_at < ?`
			)
			.bind(start, end)
			.first();
		return {
			start,
			total: Number(row?.total ?? 0),
			orders: Number(row?.orders ?? 0),
			tickets: Number(row?.tickets ?? 0),
			fondoNet: Number(row?.fondo_net ?? 0)
		};
	});
}

/**
 * `kind: 'account'`: una cuenta o un perfil nuevos (no lo hizo une admin; ver accountEvents.js).
 * `href`: a dónde lleva el ítem, si no sale de `slug`/`orderId` (cuentas y perfiles).
 * @typedef {{
 *   at: number,
 *   kind: 'order' | 'transfer' | 'refund' | 'audit' | 'checkin' | 'account',
 *   title: string,
 *   who: string,
 *   detail: string,
 *   slug: string | null,
 *   orderId: string | null,
 *   href?: string | null
 * }} ActivityItem
 */

/** Lo que dice el ítem de actividad de una novedad de cuentas (en vez del autor y la acción). */
const ACCOUNT_EVENT_WHO = /** @type {Record<string, string>} */ ({
	[ACCOUNT_EVENT_ACTIONS.accountCreated]: 'Cuenta nueva · Ingresar',
	[ACCOUNT_EVENT_ACTIONS.profileCreated]: 'Perfil nuevo · Mi rincón'
});

/**
 * A dónde lleva una entrada del registro que apunta a una cuenta o a un perfil.
 * @param {unknown} type
 * @param {unknown} id
 */
function auditTargetHref(type, id) {
	if (!id) return null;
	if (type === 'account') return accountHref(String(id));
	if (type === 'profile') return profileHref(String(id));
	return null;
}

const ORDER_KIND = /** @type {const} */ ({
	approved: 'order',
	awaiting_transfer: 'transfer',
	refunded: 'refund'
});

/**
 * Últimos movimientos: compras, transferencias, reembolsos, ingresos en la puerta (juntados por
 * evento cada {@link CHECKIN_BUCKET_MS}, para que una noche de check-in no tape todo lo demás) y
 * acciones de admins (registro de actividad), de la más nueva a la más vieja. `since`: solo lo
 * posterior a ese instante.
 *
 * @param {D1Database | null | undefined} db
 * @param {{ limit?: number, since?: number, titles?: Map<string, string> }} [opts]
 * @returns {Promise<ActivityItem[]>}
 */
export async function recentActivity(db, { limit = 12, since = 0, titles = new Map() } = {}) {
	const [orders, audit, checkins] = await Promise.all([
		safe(db, 'actividad: órdenes', /** @type {Record<string, unknown>[]} */ ([]), async (db) => {
			const { results } = await db
				.prepare(
					`SELECT id, event_slug, status, buyer_name, buyer_pronouns, quantity, ticket_type, total,
						payment_method, updated_at, created_at
					FROM orders WHERE status IN ('approved', 'awaiting_transfer', 'refunded') AND updated_at > ?
					ORDER BY updated_at DESC LIMIT ?`
				)
				.bind(since, limit)
				.all();
			return results;
		}),
		safe(db, 'actividad: registro', /** @type {Record<string, unknown>[]} */ ([]), async (db) => {
			const { results } = await db
				.prepare(
					`SELECT id, at, actor_login, action, target_type, target_id, summary FROM admin_audit
					WHERE at > ? ORDER BY at DESC LIMIT ?`
				)
				.bind(since, limit)
				.all();
			return results;
		}),
		safe(db, 'actividad: ingresos', /** @type {Record<string, unknown>[]} */ ([]), async (db) => {
			const { results } = await db
				.prepare(
					`SELECT event_slug, COUNT(*) AS n, MIN(checked_in_at) AS first, MAX(checked_in_at) AS last
					FROM tickets WHERE checked_in_at > ?1
					GROUP BY event_slug, CAST(checked_in_at / ?3 AS INTEGER) ORDER BY last DESC LIMIT ?2`
				)
				.bind(since, limit, CHECKIN_BUCKET_MS)
				.all();
			return results;
		})
	]);
	/** @type {ActivityItem[]} */
	const items = [];
	for (const o of orders) {
		const kind = ORDER_KIND[/** @type {keyof typeof ORDER_KIND} */ (String(o.status))];
		if (!kind) continue;
		const slug = String(o.event_slug);
		const ref = orderReference(String(o.id));
		const title =
			kind === 'order'
				? o.payment_method === 'transferencia'
					? 'Transferencia confirmada'
					: 'Compra'
				: kind === 'transfer'
					? 'Reservó por transferencia'
					: 'Reembolso';
		items.push({
			at: Number(o.updated_at),
			kind,
			title,
			who: o.buyer_pronouns ? `${o.buyer_name} (${o.buyer_pronouns})` : String(o.buyer_name),
			detail: `${ref} · ${o.quantity} × ${o.ticket_type} · ${titles.get(slug) ?? slug}`,
			slug,
			orderId: String(o.id)
		});
	}
	for (const a of audit) {
		const accountEvent = ACCOUNT_EVENT_WHO[String(a.action)];
		items.push({
			at: Number(a.at),
			kind: accountEvent ? 'account' : 'audit',
			title: String(a.summary),
			who: accountEvent ?? String(a.actor_login),
			detail: accountEvent ? '' : String(a.action),
			slug: a.target_type === 'event' && a.target_id ? String(a.target_id) : null,
			orderId: null,
			href: auditTargetHref(a.target_type, a.target_id)
		});
	}
	for (const c of checkins) {
		const slug = String(c.event_slug);
		const n = Number(c.n);
		const first = Number(c.first);
		const last = Number(c.last);
		items.push({
			at: last,
			kind: 'checkin',
			title: n === 1 ? '1 ingreso en la puerta' : `${n} ingresos en la puerta`,
			who: titles.get(slug) ?? slug,
			detail:
				n === 1 || arTime(first) === arTime(last)
					? arTime(last)
					: `${arTime(first)} a ${arTime(last)}`,
			slug,
			orderId: null
		});
	}
	items.sort((a, b) => b.at - a.at);
	return items.slice(0, limit);
}

/**
 * Resumen de "desde tu última visita": cuántas compras, transferencias nuevas y acciones de
 * otres admins hubo desde `since`, más la lista de movimientos.
 *
 * @param {D1Database | null | undefined} db
 * @param {{ since: number, login?: string, titles?: Map<string, string> }} opts
 */
export async function sinceLastVisit(db, { since, login = '', titles }) {
	const counts = await safe(db, 'desde tu última visita', null, async (db) => {
		const row = await db
			.prepare(
				`SELECT
					(SELECT COUNT(*) FROM orders WHERE status = 'approved' AND updated_at > ?1) AS orders,
					(SELECT COALESCE(SUM(total), 0) FROM orders WHERE status = 'approved' AND updated_at > ?1) AS money,
					(SELECT COUNT(*) FROM orders WHERE status = 'awaiting_transfer' AND created_at > ?1) AS transfers,
					(SELECT COUNT(*) FROM admin_audit WHERE at > ?1 AND actor_login != ?2) AS audit`
			)
			.bind(since, login)
			.first();
		return {
			orders: Number(row?.orders ?? 0),
			money: Number(row?.money ?? 0),
			transfers: Number(row?.transfers ?? 0),
			audit: Number(row?.audit ?? 0)
		};
	});
	if (!counts) return null;
	const items = await recentActivity(db, { since, limit: 15, titles });
	return { since, ...counts, items };
}

/**
 * @typedef {{
 *   slug: string,
 *   title: string,
 *   start: string,
 *   day: string,
 *   location: string,
 *   status: string,
 *   draft: boolean,
 *   today: boolean,
 *   hasImage: boolean,
 *   ticketed: boolean,
 *   online: boolean,
 *   fondoEnabled: boolean,
 *   salesNotYet: boolean,
 *   capacity: number | null,
 *   sold: number,
 *   held: number,
 *   revenue: number,
 *   fondoNet: number,
 *   oversold: { type: string, sold: number, capacity: number }[],
 *   transfers: number,
 *   review: number,
 *   missingStream: boolean,
 *   failedReminders: number,
 *   stuckReminders: number,
 *   stuckStreamLinks: number,
 *   checkedIn: number,
 *   issued: number
 * }} UpcomingEvent
 */

/**
 * Junta los eventos próximos (desde hoy, hora de Argentina) con sus números. Sin límite de
 * cantidad (Q16: todos los próximos), del más cercano al más lejano. Los eventos no publicados
 * (`force_unpublished`) no entran; los no listados sí, como borradores.
 *
 * @param {{
 *   events: EventSummary[],
 *   ticketed: Map<string, EventTickets>,
 *   totals?: Map<string, Map<string, TypeTotals>>,
 *   checkins?: Map<string, { tickets: number, checkedIn: number }>,
 *   transfers?: { slug: string, count: number }[],
 *   review?: { slug: string }[],
 *   streamLinks?: Set<string>,
 *   reminders?: Map<string, number>,
 *   stuck?: { reminders: Map<string, number>, streamLinks: Map<string, number> },
 *   now: number,
 *   skip?: (slug: string) => boolean
 * }} input
 * @returns {UpcomingEvent[]}
 */
export function upcomingEvents({
	events,
	ticketed,
	totals = new Map(),
	checkins = new Map(),
	transfers = [],
	review = [],
	streamLinks = new Set(),
	reminders = new Map(),
	stuck = { reminders: new Map(), streamLinks: new Map() },
	now,
	skip = () => false
}) {
	const today = arDay(now);
	const transferBy = new Map(transfers.map((t) => [t.slug, t.count]));
	/** @type {Map<string, number>} */
	const reviewBy = new Map();
	for (const r of review) reviewBy.set(r.slug, (reviewBy.get(r.slug) ?? 0) + 1);
	/** @type {UpcomingEvent[]} */
	const out = [];
	for (const e of events) {
		if (e.unpublished || !e.start || skip(e.slug)) continue;
		const day = arDay(e.start);
		if (!day || day < today) continue;
		const config = ticketed.get(e.slug);
		const byType = totals.get(e.slug) ?? new Map();
		// `null`: algún tipo no tiene cupo (sin límite), así que el evento tampoco.
		/** @type {number | null} */
		let capacity = 0;
		let sold = 0;
		let held = 0;
		let revenue = 0;
		let fondoNet = 0;
		/** @type {UpcomingEvent['oversold']} */
		const oversold = [];
		for (const t of config?.types ?? []) {
			const c = byType.get(t.id);
			/** @type {number | null} */
			const cap = t.capacity ?? null;
			capacity = capacity === null || cap === null ? null : capacity + cap;
			sold += c?.sold ?? 0;
			held += c?.held ?? 0;
			if (c && cap !== null && c.sold > cap)
				oversold.push({ type: t.name, sold: c.sold, capacity: cap });
		}
		for (const c of byType.values()) {
			revenue += c.revenue;
			fondoNet += c.contribution - c.fondo;
		}
		const ci = checkins.get(e.slug);
		out.push({
			slug: e.slug,
			title: e.title,
			start: e.start,
			day,
			location: e.location,
			status: config?.status ?? e.status,
			draft: e.unlisted,
			today: day === today,
			hasImage: Boolean(e.thumb),
			ticketed: Boolean(config),
			online: Boolean(config?.online),
			fondoEnabled: Boolean(config?.fondoEnabled),
			salesNotYet: Boolean(config && config.opensAt !== null && now < config.opensAt),
			capacity,
			sold,
			held,
			revenue,
			fondoNet,
			oversold,
			transfers: transferBy.get(e.slug) ?? 0,
			review: reviewBy.get(e.slug) ?? 0,
			missingStream: Boolean(config?.online && sold > 0 && !streamLinks.has(e.slug)),
			failedReminders: reminders.get(e.slug) ?? 0,
			stuckReminders: stuck.reminders.get(e.slug) ?? 0,
			stuckStreamLinks: stuck.streamLinks.get(e.slug) ?? 0,
			checkedIn: ci?.checkedIn ?? 0,
			issued: ci?.tickets ?? 0
		});
	}
	out.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
	return out;
}

/**
 * @typedef {{
 *   id: string,
 *   tone: 'warn' | 'bad' | 'info',
 *   icon: string,
 *   title: string,
 *   text: string,
 *   action: string,
 *   href?: string,
 *   resend?: { orderId: string },
 *   group?: ReviewGroupKind,
 *   name?: string,
 *   retryReminders?: { slug: string }
 * }} ReviewItem
 */

/**
 * Tipos de ítem de "Para revisar" que se juntan si hay varios: la higiene de contenido (sin
 * imagen, borradores) y los perfiles nuevos de cuentas (ver `groupReviewItems`).
 * @typedef {'image' | 'draft' | 'profile'} ReviewGroupKind
 */

/**
 * "Para revisar": un ítem por cada perfil creado por una cuenta que ninguna admin revisó todavía
 * (`profilesToReview` en cuentas.js). Queda hasta que une admin lo marca como revisado, lo oculta
 * o lo borra desde su ficha; si son varios, `groupReviewItems` los junta en una fila que lleva a
 * Cuentas → Perfiles filtrado.
 *
 * @param {{ id: number, title: string, kind: 'persona' | 'grupo', createdAt: number }[]} profiles
 * @param {{ formatWhen?: (ms: number) => string }} [opts]
 * @returns {ReviewItem[]}
 */
export function profileReviewItems(profiles, { formatWhen } = {}) {
	return profiles.map((p) => ({
		id: `profile-${p.id}`,
		tone: 'info',
		icon: 'profile',
		title: `Perfil nuevo: ${p.title}`,
		text: `${p.kind === 'grupo' ? 'Grupo' : 'Persona'} · creado desde Mi rincón${formatWhen ? ` ${formatWhen(p.createdAt)}` : ''}`,
		action: 'Revisar',
		href: profileHref(p.id),
		group: 'profile',
		name: p.title
	}));
}

/**
 * "Para revisar" (Q14: todo lo de la propuesta): cada ítem con su acción.
 *
 * @param {{
 *   upcoming: UpcomingEvent[],
 *   transfers: { slug: string, count: number, oldestExpiry: number }[],
 *   unsent: { id: string, ref: string, slug: string, buyerName: string }[],
 *   review: { id: string, ref: string, slug: string, reason: string, buyerName: string }[],
 *   titles: Map<string, string>,
 *   links: {
 *     transfers: (slug: string) => string,
 *     order: (slug: string, id?: string) => string,
 *     stream: (slug: string) => string,
 *     edit: (slug: string) => string
 *   },
 *   formatWhen: (ms: number) => string
 * }} input
 * @returns {ReviewItem[]}
 */
export function reviewItems({ upcoming, transfers, unsent, review, titles, links, formatWhen }) {
	/** @type {ReviewItem[]} */
	const items = [];
	/** @param {string} slug */
	const title = (slug) => titles.get(slug) ?? slug;
	/** @param {number} n @param {string} one @param {string} many */
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

	for (const t of transfers) {
		items.push({
			id: `transfer-${t.slug}`,
			tone: 'warn',
			icon: 'transfer',
			title: `${plural(t.count, 'transferencia', 'transferencias')} esperando confirmación`,
			text: `${title(t.slug)} · la más vieja vence ${formatWhen(t.oldestExpiry)}`,
			action: 'Revisar',
			href: links.transfers(t.slug)
		});
	}
	for (const o of review) {
		items.push({
			id: `review-${o.id}`,
			tone: 'bad',
			icon: 'alert',
			title:
				o.reason === 'duplicate_payment'
					? `Pago duplicado de ${o.buyerName}`
					: `Pago tardío de ${o.buyerName} (la reserva había vencido)`,
			text: `${o.ref} · ${title(o.slug)}`,
			action: 'Ver orden',
			href: links.order(o.slug, o.id)
		});
	}
	for (const o of unsent) {
		items.push({
			id: `mail-${o.id}`,
			tone: 'bad',
			icon: 'mail',
			title: `No salió el mail de ${o.buyerName}`,
			text: `${o.ref} · ${title(o.slug)}`,
			action: 'Reenviar',
			resend: { orderId: o.id }
		});
	}
	for (const e of upcoming) {
		for (const o of e.oversold) {
			items.push({
				id: `oversold-${e.slug}-${o.type}`,
				tone: 'bad',
				icon: 'alert',
				title: `Cupo sobrevendido: ${e.title}`,
				text: `${o.type}: ${o.sold} vendidas para un cupo de ${o.capacity}`,
				action: 'Ver ventas',
				href: links.order(e.slug)
			});
		}
		if (e.missingStream) {
			items.push({
				id: `stream-${e.slug}`,
				tone: 'warn',
				icon: 'link',
				title: `${e.title}: falta el link de la transmisión`,
				text: `${plural(e.sold, 'persona compró', 'personas compraron')} y lo espera${e.sold === 1 ? '' : 'n'}`,
				action: 'Cargar link',
				href: links.stream(e.slug)
			});
		}
		if (e.failedReminders) {
			items.push({
				id: `reminder-${e.slug}`,
				tone: 'bad',
				icon: 'bell',
				title: `Recordatorios que no salieron: ${e.title}`,
				text: `${plural(e.failedReminders, 'orden sin su recordatorio', 'órdenes sin su recordatorio')}; el próximo cron lo reintenta`,
				action: 'Ver evento',
				href: links.order(e.slug)
			});
		}
		if (e.stuckReminders) {
			items.push({
				id: `reminder-failed-${e.slug}`,
				tone: 'bad',
				icon: 'bell',
				title: `Recordatorios que fallaron: ${e.title}`,
				text: `${plural(e.stuckReminders, 'orden', 'órdenes')} sin su recordatorio después de varios intentos (ver logs); ya no se reintenta solo`,
				action: 'Reintentar',
				retryReminders: { slug: e.slug }
			});
		}
		if (e.stuckStreamLinks) {
			items.push({
				id: `stream-failed-${e.slug}`,
				tone: 'bad',
				icon: 'link',
				title: `El link de la transmisión no le llegó a todes: ${e.title}`,
				text: `${plural(e.stuckStreamLinks, 'orden', 'órdenes')} sin el link después de varios intentos (ver logs); "Enviar el link a todes" lo reintenta`,
				action: 'Ver link',
				href: links.stream(e.slug)
			});
		}
	}
	// Los borradores también: así la cuenta coincide con el filtro "Sin imagen" de Eventos.
	for (const e of upcoming) {
		if (!e.hasImage) {
			items.push({
				id: `image-${e.slug}`,
				tone: 'info',
				icon: 'image',
				title: `${e.title} no tiene imagen`,
				text: 'Sin imagen no se ve bien en el calendario ni al compartir',
				action: 'Agregar',
				href: links.edit(e.slug),
				group: 'image',
				name: e.title
			});
		}
	}
	for (const e of upcoming) {
		if (e.draft) {
			items.push({
				id: `draft-${e.slug}`,
				tone: 'info',
				icon: 'draft',
				title: `Borrador sin publicar: ${e.title}`,
				text: 'No aparece en el calendario',
				action: 'Revisar',
				href: links.edit(e.slug),
				group: 'draft',
				name: e.title
			});
		}
	}
	return items;
}

/**
 * Una fila de "Para revisar" que junta varios ítems del mismo tipo. Con `href` la fila lleva a
 * una lista filtrada que muestra exactamente esos ítems; sin `href`, se despliega ahí mismo.
 * @typedef {{
 *   id: string,
 *   tone: 'info' | 'bad',
 *   icon: string,
 *   title: string,
 *   text: string,
 *   action: string,
 *   href?: string,
 *   items: ReviewItem[]
 * }} ReviewGroup
 */

/** @typedef {({ kind: 'item' } & ReviewItem) | ({ kind: 'group' } & ReviewGroup)} ReviewRow */

/**
 * Agrupa lo repetitivo de "Para revisar": lo urgente (plata, entradas, gente) queda de a uno,
 * y cada tipo de higiene de contenido con `min` o más ítems pasa a ser una sola fila con la
 * cuenta. Con menos, quedan de a uno (un solo ítem es más útil con su acción directa).
 * Conserva el orden: los grupos van donde estaba su primer ítem.
 *
 * @param {ReviewItem[]} items
 * @param {{ links: { noImage: string, profiles?: string }, min?: number }} opts
 * @returns {ReviewRow[]}
 */
export function groupReviewItems(items, { links, min = 2 }) {
	/** @type {Map<ReviewGroupKind, ReviewItem[]>} */
	const byKind = new Map();
	for (const i of items) {
		if (i.group) byKind.set(i.group, [...(byKind.get(i.group) ?? []), i]);
	}
	/** @param {number} n @param {string} one @param {string} many */
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
	/** @type {Record<ReviewGroupKind, (list: ReviewItem[]) => ReviewGroup>} */
	const make = {
		image: (list) => ({
			id: 'group-image',
			tone: 'info',
			icon: 'image',
			title: plural(list.length, 'evento próximo sin imagen', 'eventos próximos sin imagen'),
			text: 'Sin imagen no se ven bien en el calendario ni al compartir',
			action: 'Ver',
			href: links.noImage,
			items: list
		}),
		// El filtro "Borradores" de Eventos incluye los de eventos pasados: se despliega acá.
		draft: (list) => ({
			id: 'group-draft',
			tone: 'info',
			icon: 'draft',
			title: plural(list.length, 'borrador sin publicar', 'borradores sin publicar'),
			text: 'Eventos próximos que no aparecen en el calendario',
			action: 'Ver',
			items: list
		}),
		profile: (list) => ({
			id: 'group-profile',
			tone: 'info',
			icon: 'profile',
			title: plural(list.length, 'perfil nuevo para revisar', 'perfiles nuevos para revisar'),
			text: 'Creados desde Mi rincón; quedan acá hasta que los marques como revisados',
			action: 'Ver',
			href: links.profiles ?? PROFILES_TO_REVIEW_HREF,
			items: list
		})
	};
	/** @type {ReviewRow[]} */
	const rows = [];
	/** @type {Set<ReviewGroupKind>} */
	const placed = new Set();
	for (const i of items) {
		const list = i.group ? (byKind.get(i.group) ?? []) : [];
		if (!i.group || list.length < min) {
			rows.push({ kind: 'item', ...i });
		} else if (!placed.has(i.group)) {
			placed.add(i.group);
			rows.push({ kind: 'group', ...make[i.group](list) });
		}
	}
	return rows;
}

/**
 * "Para revisar": una sola fila con lo que encontró el último chequeo nocturno de integridad de
 * los objetos (se despliega con cada problema: código y slug). Nada si la última corrida salió
 * bien o si no hubo ninguna.
 *
 * @param {import('$lib/server/objects/integrity.js').IntegrityRun | null} run
 * @param {{ formatWhen?: (ms: number) => string }} [opts]
 * @returns {ReviewRow | null}
 */
export function integrityReviewRow(run, { formatWhen } = {}) {
	if (!run || run.count <= 0) return null;
	/** @param {number} n @param {string} one @param {string} many */
	const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
	/** @type {Map<string, number>} */
	const byCode = new Map();
	for (const p of run.problems) byCode.set(p.code, (byCode.get(p.code) ?? 0) + 1);
	const codes = [...byCode].map(([code, n]) => (n > 1 ? `${code} ×${n}` : code)).join(', ');
	/** @type {ReviewItem[]} */
	const items = run.problems.map((p, i) => {
		const where =
			p.slug ??
			(p.objectId !== undefined
				? `objeto ${p.objectId}`
				: p.edgeId !== undefined
					? `relación ${p.edgeId}`
					: (p.type ?? ''));
		return {
			id: `integrity-${i}`,
			tone: 'bad',
			icon: 'alert',
			title: p.code,
			text: '',
			action: '',
			name: where ? `${p.code} · ${where}` : p.code
		};
	});
	const hidden = run.count - run.problems.length;
	if (hidden > 0) {
		items.push({
			id: 'integrity-more',
			tone: 'bad',
			icon: 'alert',
			title: 'más',
			text: '',
			action: '',
			name: `y ${plural(hidden, 'problema más', 'problemas más')} (ver los logs del cron)`
		});
	}
	const when = formatWhen ? ` · revisado ${formatWhen(run.ranAt)}` : '';
	return {
		kind: 'group',
		id: 'group-integrity',
		tone: 'bad',
		icon: 'alert',
		title: `Chequeo nocturno: ${plural(run.count, 'problema', 'problemas')} en los datos`,
		text: `${codes || 'sin detalle'}${when}. No se arregla solo.`,
		action: 'Ver',
		items
	};
}

const TZ = 'America/Argentina/Buenos_Aires';

/**
 * "en 3 h", "en 40 min" o "jue 2, 14:00" (hora de Argentina).
 * @param {number} ms
 * @param {number} now
 */
export function whenLabel(ms, now) {
	const diff = ms - now;
	if (diff > 0 && diff < 60 * 60 * 1000) return `en ${Math.max(1, Math.round(diff / 60000))} min`;
	if (diff > 0 && diff < 24 * 60 * 60 * 1000) return `en ${Math.round(diff / 3600000)} h`;
	return new Intl.DateTimeFormat('es-AR', {
		timeZone: TZ,
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	}).format(ms);
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Días que cubre la agenda del Inicio (hoy incluido). */
export const AGENDA_DAYS = 7;
/** En la actividad, los ingresos en la puerta se juntan por evento y por esta ventana. */
export const CHECKIN_BUCKET_MS = 30 * 60 * 1000;

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/**
 * "Hoy", "Mañana", "Ayer" o "vie 2/10" para un día `YYYY-MM-DD`.
 * @param {string} day
 * @param {string} today
 */
export function dayLabel(day, today) {
	const d = new Date(`${day}T12:00:00Z`);
	const diff = Math.round((d.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / DAY_MS);
	if (diff === 0) return 'Hoy';
	if (diff === 1) return 'Mañana';
	if (diff === -1) return 'Ayer';
	return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

/**
 * "21:30" en hora de Argentina.
 * @param {number} ms
 */
export function arTime(ms) {
	const d = new Date(ms + AR_OFFSET_MS);
	return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Transferencias esperando confirmación que vencen entre `now` y `until`, por evento y día
 * (hora de Argentina): cuántas y la primera en vencer. Para la agenda.
 *
 * @param {D1Database | null | undefined} db
 * @param {number} now
 * @param {number} until
 * @returns {Promise<{ slug: string, day: string, count: number, first: number }[]>}
 */
export function expiringTransfers(db, now, until) {
	return safe(db, 'transferencias por vencer', [], async (db) => {
		const { results } = await db
			.prepare(
				`SELECT event_slug, COUNT(*) AS n, MIN(expires_at) AS first FROM orders
				WHERE status = 'awaiting_transfer' AND expires_at > ?1 AND expires_at < ?2
				GROUP BY event_slug, CAST((expires_at + ?3) / ?4 AS INTEGER) ORDER BY first`
			)
			.bind(now, until, AR_OFFSET_MS, DAY_MS)
			.all();
		return results.map((r) => ({
			slug: String(r.event_slug),
			day: arDay(Number(r.first)),
			count: Number(r.n),
			first: Number(r.first)
		}));
	});
}

/**
 * @typedef {{
 *   id: string,
 *   at: number,
 *   kind: 'event' | 'sales-open' | 'sales-close' | 'type-close' | 'transfers' | 'reminder',
 *   title: string,
 *   text: string,
 *   href: string | null,
 *   past: boolean,
 *   time?: string
 * }} AgendaItem
 * @typedef {{ day: string, label: string, items: AgendaItem[] }} AgendaDay
 */

/**
 * Agenda de los próximos {@link AGENDA_DAYS} días (desde la medianoche de hoy, hora de
 * Argentina): eventos, aperturas y cierres de venta, cierres de un tipo de entrada (la
 * anticipada), transferencias que vencen y recordatorios por mail programados. Agrupada por día
 * (solo los días con algo), cada ítem con su link en el panel. Lo de hoy que ya pasó queda
 * marcado con `past`.
 *
 * @param {{
 *   events: EventSummary[],
 *   ticketed: Map<string, EventTickets>,
 *   transfers?: { slug: string, count: number, first: number }[],
 *   reminders?: import('$lib/server/tickets/reminders.js').Reminder[],
 *   now: number,
 *   days?: number,
 *   skip?: (slug: string) => boolean,
 *   links: {
 *     event: (slug: string, opts?: { tickets?: boolean }) => string,
 *     orders: (slug: string) => string,
 *     transfers: (slug: string) => string,
 *     reminders: string
 *   }
 * }} input
 * @returns {AgendaDay[]}
 */
export function agendaItems({
	events,
	ticketed,
	transfers = [],
	reminders = [],
	now,
	days = AGENDA_DAYS,
	skip = () => false,
	links
}) {
	const from = arDayStart(now);
	const until = from + days * DAY_MS;
	const today = arDay(now);
	/** @param {number | null | undefined} t @returns {t is number} */
	const inWindow = (t) => typeof t === 'number' && Number.isFinite(t) && t >= from && t < until;
	/** @type {AgendaItem[]} */
	const items = [];
	/** @type {Map<string, string>} */
	const titles = new Map();

	for (const e of events) {
		if (e.unpublished || !e.start || skip(e.slug)) continue;
		titles.set(e.slug, e.title);
		const config = ticketed.get(e.slug);
		const start = Date.parse(e.start);
		const cancelled = (config?.status ?? e.status) === 'cancelado';
		if (inWindow(start)) {
			items.push({
				id: `event-${e.slug}`,
				at: start,
				kind: 'event',
				title: e.title,
				text: [
					cancelled ? 'Cancelado' : '',
					e.unlisted ? 'Borrador' : '',
					config?.online ? 'Online' : e.location
				]
					.filter(Boolean)
					.join(' · '),
				href: links.event(e.slug, { tickets: Boolean(config) }),
				past: start < now
			});
		}
		if (!config || cancelled) continue;
		if (inWindow(config.opensAt)) {
			items.push({
				id: `open-${e.slug}`,
				at: config.opensAt,
				kind: 'sales-open',
				title: `Abre la venta: ${e.title}`,
				text: '',
				href: links.orders(e.slug),
				past: config.opensAt < now
			});
		}
		// Si la venta cierra al empezar el evento, ese cierre ya es el evento mismo.
		if (inWindow(config.closesAt) && config.closesAt !== start) {
			items.push({
				id: `close-${e.slug}`,
				at: config.closesAt,
				kind: 'sales-close',
				title: `Cierra la venta: ${e.title}`,
				text: '',
				href: links.orders(e.slug),
				past: config.closesAt < now
			});
		}
		for (const t of config.types) {
			const at = t.closesAt;
			if (!inWindow(at)) continue;
			if (config.closesAt !== null && at >= config.closesAt) continue;
			items.push({
				id: `type-${e.slug}-${t.id}`,
				at,
				kind: 'type-close',
				title: `Cierra «${t.name}»: ${e.title}`,
				text: 'Los otros tipos siguen a la venta',
				href: links.orders(e.slug),
				past: at < now
			});
		}
		if (config.reminders && Number.isFinite(start) && start > now) {
			for (const r of reminders) {
				if (!r.enabled) continue;
				const at = reminderDueAt(r, start);
				if (!inWindow(at)) continue;
				items.push({
					id: `reminder-${e.slug}-${reminderId(r)}`,
					at,
					kind: 'reminder',
					title: `Recordatorio por mail: ${e.title}`,
					text: describeReminder(r),
					href: links.reminders,
					past: at < now
				});
			}
		}
	}
	for (const t of transfers) {
		if (!inWindow(t.first) || skip(t.slug)) continue;
		items.push({
			id: `transfers-${t.slug}-${arDay(t.first)}`,
			at: t.first,
			kind: 'transfers',
			title: t.count === 1 ? 'Vence 1 transferencia' : `Vencen ${t.count} transferencias`,
			text: `${titles.get(t.slug) ?? t.slug} · sin confirmar`,
			href: links.transfers(t.slug),
			past: t.first < now
		});
	}
	items.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
	/** @type {AgendaDay[]} */
	const out = [];
	for (const item of items) {
		const day = arDay(item.at);
		let group = out.at(-1);
		if (!group || group.day !== day) {
			group = { day, label: dayLabel(day, today), items: [] };
			out.push(group);
		}
		group.items.push({ ...item, time: arTime(item.at) });
	}
	return out;
}

/**
 * @typedef {{ days: { day: string, count: number }[], online: number, door: number }} SalesTrend
 */

/**
 * Ventas de un evento por día (fecha de la compra, hora de Argentina) en los últimos `days` días
 * hasta hoy inclusive, y cuántas entradas se vendieron online y en la puerta. La columna
 * `channel` llega con la migración del modo puerta: sin ella todo cuenta como online.
 * Una sola ida a la base (un batch).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} slug
 * @param {number} now
 * @param {number} [days]
 * @returns {Promise<SalesTrend | null>}
 */
export function eventSalesTrend(db, slug, now, days = 7) {
	return safe(db, 'ventas por día', null, async (db) => {
		const from = arDayStart(now) - (days - 1) * DAY_MS;
		const byDay = db
			.prepare(
				`SELECT CAST((created_at - ?1) / ?2 AS INTEGER) AS d, SUM(quantity) AS n FROM orders
				WHERE event_slug = ?3 AND status = 'approved' AND created_at >= ?1
				GROUP BY d`
			)
			.bind(from, DAY_MS, slug);
		/** @param {boolean} withChannel */
		const byChannel = (withChannel) =>
			db
				.prepare(
					`SELECT ${withChannel ? 'channel' : "'online'"} AS channel, SUM(quantity) AS n
					FROM orders WHERE event_slug = ? AND status = 'approved' GROUP BY 1`
				)
				.bind(slug);
		let res;
		try {
			res = await db.batch([byDay, byChannel(true)]);
		} catch (error) {
			if (!/channel/i.test(String(/** @type {Error} */ (error)?.message ?? error))) throw error;
			res = await db.batch([byDay, byChannel(false)]);
		}
		/** @type {Map<number, number>} */
		const counts = new Map();
		for (const r of /** @type {Record<string, unknown>[]} */ (res[0].results)) {
			counts.set(Number(r.d), Number(r.n ?? 0));
		}
		let online = 0;
		let door = 0;
		for (const r of /** @type {Record<string, unknown>[]} */ (res[1].results)) {
			if (r.channel === 'puerta') door += Number(r.n ?? 0);
			else online += Number(r.n ?? 0);
		}
		return {
			days: Array.from({ length: days }, (_, i) => ({
				day: arDay(from + i * DAY_MS),
				count: counts.get(i) ?? 0
			})),
			online,
			door
		};
	});
}

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   sold: number,
 *   held: number,
 *   capacity: number | null,
 *   over: number,
 *   closed: boolean
 * }} SalesType
 * @typedef {{
 *   event: UpcomingEvent,
 *   others: { slug: string, title: string }[],
 *   when: string,
 *   types: SalesType[],
 *   trend: (Omit<SalesTrend, 'days'> & { days: { day: string, label: string, count: number }[] }) | null
 * }} SalesSummary
 */

/**
 * El evento del bloque de ventas: de los de hoy con entradas, el que más vendió; si no hay, el
 * próximo con entradas. Cancelados y borradores no cuentan. `others`: los otros de hoy.
 *
 * @param {UpcomingEvent[]} upcoming
 * @returns {{ event: UpcomingEvent, others: { slug: string, title: string }[] } | null}
 */
export function salesFocus(upcoming) {
	const candidates = upcoming.filter((e) => e.ticketed && !e.draft && e.status !== 'cancelado');
	const today = candidates.filter((e) => e.today);
	if (today.length) {
		const event = today.reduce((best, e) => (e.sold > best.sold ? e : best));
		return {
			event,
			others: today.filter((e) => e !== event).map((e) => ({ slug: e.slug, title: e.title }))
		};
	}
	return candidates.length ? { event: candidates[0], others: [] } : null;
}

/**
 * Resumen de ventas del evento elegido: por tipo (vendidas, reservadas, cupo o `null` si no
 * tiene, cuánto se pasó del cupo, si ese tipo ya cerró) y la tendencia por día.
 *
 * @param {{
 *   focus: { event: UpcomingEvent, others: { slug: string, title: string }[] },
 *   config: EventTickets | undefined,
 *   totals: Map<string, Map<string, TypeTotals>>,
 *   trend: SalesTrend | null,
 *   now: number
 * }} input
 * @returns {SalesSummary}
 */
export function salesSummary({ focus, config, totals, trend, now }) {
	const byType = totals.get(focus.event.slug) ?? new Map();
	const today = arDay(now);
	const start = Date.parse(focus.event.start);
	return {
		...focus,
		when: `${dayLabel(focus.event.day, today)}${Number.isFinite(start) ? ` · ${arTime(start)}` : ''}`,
		types: (config?.types ?? []).map((t) => {
			const c = byType.get(t.id);
			const sold = c?.sold ?? 0;
			/** @type {number | null} */
			const capacity = t.capacity ?? null;
			return {
				id: t.id,
				name: t.name,
				sold,
				held: c?.held ?? 0,
				capacity,
				over: capacity !== null && sold > capacity ? sold - capacity : 0,
				closed: t.closesAt != null && t.closesAt <= now
			};
		}),
		trend: trend
			? { ...trend, days: trend.days.map((d) => ({ ...d, label: dayLabel(d.day, today) })) }
			: null
	};
}

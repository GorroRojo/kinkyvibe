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
import { dueReminderOrders } from '$lib/server/tickets/reminders.js';

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
 * @typedef {{
 *   at: number,
 *   kind: 'order' | 'transfer' | 'refund' | 'audit',
 *   title: string,
 *   who: string,
 *   detail: string,
 *   slug: string | null,
 *   orderId: string | null
 * }} ActivityItem
 */

const ORDER_KIND = /** @type {const} */ ({
	approved: 'order',
	awaiting_transfer: 'transfer',
	refunded: 'refund'
});

/**
 * Últimos movimientos: compras, transferencias, reembolsos y acciones de admins (registro de
 * actividad), de la más nueva a la más vieja. `since`: solo lo posterior a ese instante.
 *
 * @param {D1Database | null | undefined} db
 * @param {{ limit?: number, since?: number, titles?: Map<string, string> }} [opts]
 * @returns {Promise<ActivityItem[]>}
 */
export async function recentActivity(db, { limit = 12, since = 0, titles = new Map() } = {}) {
	const [orders, audit] = await Promise.all([
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
		items.push({
			at: Number(a.at),
			kind: 'audit',
			title: String(a.summary),
			who: String(a.actor_login),
			detail: String(a.action),
			slug: a.target_type === 'event' && a.target_id ? String(a.target_id) : null,
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
 *   capacity: number,
 *   sold: number,
 *   held: number,
 *   revenue: number,
 *   fondoNet: number,
 *   oversold: { type: string, sold: number, capacity: number }[],
 *   transfers: number,
 *   review: number,
 *   missingStream: boolean,
 *   failedReminders: number,
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
		let capacity = 0;
		let sold = 0;
		let held = 0;
		let revenue = 0;
		let fondoNet = 0;
		/** @type {UpcomingEvent['oversold']} */
		const oversold = [];
		for (const t of config?.types ?? []) {
			const c = byType.get(t.id);
			capacity += t.capacity;
			sold += c?.sold ?? 0;
			held += c?.held ?? 0;
			if (c && c.sold > t.capacity)
				oversold.push({ type: t.name, sold: c.sold, capacity: t.capacity });
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
 *   resend?: { orderId: string }
 * }} ReviewItem
 */

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
	}
	for (const e of upcoming) {
		if (!e.hasImage && !e.draft) {
			items.push({
				id: `image-${e.slug}`,
				tone: 'info',
				icon: 'image',
				title: `${e.title} no tiene imagen`,
				text: 'Sin imagen no se ve bien en el calendario ni al compartir',
				action: 'Agregar',
				href: links.edit(e.slug)
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
				text: e.hasImage
					? 'No aparece en el calendario'
					: 'No aparece en el calendario y no tiene imagen',
				action: 'Revisar',
				href: links.edit(e.slug)
			});
		}
	}
	return items;
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

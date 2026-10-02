/**
 * Recordatorios por mail antes de cada evento con entradas.
 *
 * - Qué recordatorios hay se configura en /admin/ajustes/mails (se guarda como JSON en
 *   `ticket_settings`, clave `reminders`). Cada uno: activado o no, y cuándo:
 *   - `hours_before`: N horas antes del comienzo ("2 días antes" = 48 h);
 *   - `day_at`: N días antes (0 = el mismo día) a una hora fija, en horario de Argentina.
 *   Por defecto: 48 h antes y el mismo día a las 9:00.
 * - Un evento puede no mandarlos con `recordatorios: false` en el frontmatter.
 * - Los manda POST /api/cron/recordatorios (lo llama cada 15 minutos el Worker de
 *   workers/cron/), en tandas: cada corrida manda como mucho "de a cuántos" (Ajustes → Mails) y
 *   la siguiente sigue. Idempotente: `reminder_sends` (orden + id del recordatorio) se reserva
 *   antes de mandar; si el envío falla se reintenta en la próxima corrida, hasta 3 intentos, y
 *   después queda 'failed' y aparece en "Para revisar" (ver sendState.js).
 * - Solo a órdenes aprobadas (no canceladas ni reembolsadas), de eventos que todavía no
 *   empezaron, y compradas antes de que el recordatorio "venciera" (quien compra una hora antes
 *   del evento ya tiene el mail de las entradas: no le llega el de "faltan 2 días").
 */

import { DEFAULT_MAIL_BATCH_SIZE } from './batchSize.js';
import { STALE_CLAIM_MS, expireStaleClaims, pendingSendSql, sendBatch } from './sendState.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{ kind: 'hours_before', hours: number, enabled: boolean }
 *   | { kind: 'day_at', days: number, time: string, enabled: boolean }} Reminder
 */

/** Argentina no tiene horario de verano desde 2009: UTC−3 todo el año. */
const AR_OFFSET = '-03:00';
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
export const MAX_REMINDERS = 5;

/** @type {Reminder[]} */
export const DEFAULT_REMINDERS = [
	{ kind: 'hours_before', hours: 48, enabled: true },
	{ kind: 'day_at', days: 0, time: '09:00', enabled: true }
];

/**
 * Id estable de un recordatorio (sale de cuándo se manda: si se cambia el horario, es otro
 * recordatorio y se puede volver a mandar).
 *
 * @param {Reminder} r
 */
export function reminderId(r) {
	return r.kind === 'hours_before' ? `h${r.hours}` : `d${r.days}-${r.time.replace(':', '')}`;
}

/**
 * "2 días antes" / "3 horas antes" / "el mismo día a las 9:00" / "el día anterior a las 20:00".
 *
 * @param {Reminder} r
 */
export function describeReminder(r) {
	if (r.kind === 'hours_before') {
		return r.hours % 24 === 0
			? `${r.hours / 24 === 1 ? '1 día' : `${r.hours / 24} días`} antes`
			: `${r.hours === 1 ? '1 hora' : `${r.hours} horas`} antes`;
	}
	const time = r.time.replace(/^0/, '');
	if (r.days === 0) return `el mismo día a las ${time}`;
	if (r.days === 1) return `el día anterior a las ${time}`;
	return `${r.days} días antes a las ${time}`;
}

/**
 * Valida un recordatorio (de JSON o del formulario). `null` si no es válido.
 *
 * @param {any} raw
 * @returns {Reminder | null}
 */
export function normalizeReminder(raw) {
	const enabled = raw?.enabled !== false && raw?.enabled !== 'false';
	if (raw?.kind === 'hours_before') {
		const hours = Number(raw.hours);
		return Number.isInteger(hours) && hours >= 1 && hours <= 14 * 24
			? { kind: 'hours_before', hours, enabled }
			: null;
	}
	if (raw?.kind === 'day_at') {
		const days = Number(raw.days);
		const m = String(raw.time ?? '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
		if (!Number.isInteger(days) || days < 0 || days > 14 || !m) return null;
		return { kind: 'day_at', days, time: `${m[1].padStart(2, '0')}:${m[2]}`, enabled };
	}
	return null;
}

/**
 * Lista guardada en los ajustes → recordatorios (vacío o roto = los de por defecto).
 *
 * @param {string | null | undefined} json
 * @returns {Reminder[]}
 */
export function parseReminders(json) {
	if (!json) return DEFAULT_REMINDERS;
	try {
		const list = JSON.parse(json);
		if (!Array.isArray(list)) return DEFAULT_REMINDERS;
		return list
			.map(normalizeReminder)
			.filter(/** @returns {r is Reminder} */ (r) => r !== null)
			.slice(0, MAX_REMINDERS);
	} catch {
		return DEFAULT_REMINDERS;
	}
}

/**
 * Cuándo se manda un recordatorio para un evento que empieza en `start` (ms).
 *
 * @param {Reminder} r
 * @param {number} start
 */
export function reminderDueAt(r, start) {
	if (r.kind === 'hours_before') return start - r.hours * 60 * 60 * 1000;
	// Fecha del evento en Argentina, menos `days` días, a la hora `time` de Argentina.
	const local = new Date(start - AR_OFFSET_MS);
	local.setUTCDate(local.getUTCDate() - r.days);
	const date = local.toISOString().slice(0, 10);
	return Date.parse(`${date}T${r.time}:00${AR_OFFSET}`);
}

/**
 * Órdenes a las que les toca un recordatorio ahora (y todavía no lo recibieron ni se agotaron
 * sus intentos), del evento más cercano al más lejano.
 *
 * @param {D1Database} db
 * @param {{
 *   events: { slug: string, start: number, reminders: boolean, cancelled: boolean }[],
 *   reminders: Reminder[],
 *   now: number
 * }} input
 * @returns {Promise<{ order: import('./orders.js').Order, reminder: Reminder, id: string, slug: string }[]>}
 */
export async function dueReminderOrders(db, { events, reminders, now }) {
	const out = [];
	for (const item of dueReminderPlan({ events, reminders, now })) {
		const { results } = await db
			.prepare(`SELECT o.* FROM orders o WHERE ${DUE_REMINDER_WHERE} ORDER BY o.created_at`)
			.bind(...dueReminderParams(item, now))
			.all();
		for (const order of /** @type {import('./orders.js').Order[]} */ (results)) {
			out.push({ order, reminder: item.reminder, id: item.id, slug: item.slug });
		}
	}
	return out;
}

/**
 * Qué recordatorios de qué eventos ya tocan a `now` (sin mirar la base), del evento más cercano
 * al más lejano: lo que recorre {@link dueReminderOrders}, una consulta por cada uno.
 *
 * @param {{
 *   events: { slug: string, start: number, reminders: boolean, cancelled: boolean }[],
 *   reminders: Reminder[],
 *   now: number
 * }} input
 * @returns {{ slug: string, reminder: Reminder, id: string, due: number }[]}
 */
export function dueReminderPlan({ events, reminders, now }) {
	const out = [];
	const sorted = [...events].sort((a, b) => a.start - b.start);
	for (const e of sorted) {
		if (!e.reminders || e.cancelled || !(e.start > now)) continue;
		for (const r of reminders) {
			if (!r.enabled) continue;
			const due = reminderDueAt(r, e.start);
			if (due > now || due >= e.start) continue;
			out.push({ slug: e.slug, reminder: r, id: reminderId(r), due });
		}
	}
	return out;
}

/**
 * Qué órdenes (alias `o`) cuentan para los recordatorios: las aprobadas (no las canceladas,
 * reembolsadas ni pendientes). También lo usa «Lo que sigo» para no mandar su recordatorio a
 * quien ya tiene entrada ($lib/server/sigo/notify.js).
 */
export const REMINDER_ORDER_SQL = `o.status = 'approved'`;

/**
 * Las órdenes (alias `o`) a las que les toca un recordatorio del plan y todavía no lo recibieron
 * ni se agotaron sus intentos. Parámetros: {@link dueReminderParams}.
 */
export const DUE_REMINDER_WHERE = `o.event_slug = ?1 AND ${REMINDER_ORDER_SQL}
	AND o.created_at < ?2
	AND ${pendingSendSql('reminder_sends', { key: 3, stale: 4 })}`;

/**
 * @param {{ slug: string, id: string, due: number }} item un ítem de {@link dueReminderPlan}
 * @param {number} now
 */
export function dueReminderParams(item, now) {
	return [item.slug, item.due, item.id, now - STALE_CLAIM_MS];
}

/**
 * Manda una tanda de los recordatorios que tocan: como mucho `limit` mails (el resto, en la
 * próxima corrida del cron). Idempotente: ver sendState.js.
 *
 * @param {D1Database} db
 * @param {{
 *   events: { slug: string, start: number, reminders: boolean, cancelled: boolean }[],
 *   reminders: Reminder[],
 *   now?: number,
 *   limit?: number,
 *   send: (order: import('./orders.js').Order, reminder: Reminder) => Promise<boolean>
 * }} input
 * @returns {Promise<{ sent: number, failed: number, remaining: number }>}
 */
export async function sendDueReminders(
	db,
	{ events, reminders, now = Date.now(), limit = DEFAULT_MAIL_BATCH_SIZE, send }
) {
	await expireStaleClaims(db, 'reminder_sends', now);
	const items = await dueReminderOrders(db, { events, reminders, now });
	return sendBatch(db, 'reminder_sends', {
		items,
		limit,
		now,
		label: 'el recordatorio',
		claim: ({ order, id }) => ({ orderId: order.id, key: id }),
		send: ({ order, reminder }) => send(order, reminder)
	});
}

/**
 * Recordatorios que se intentaron {@link import('./sendState.js').MAX_ATTEMPTS} veces sin
 * éxito, por evento (solo órdenes aprobadas).
 *
 * @param {D1Database} db
 * @param {string[]} slugs
 * @returns {Promise<Map<string, number>>}
 */
export async function failedReminderCounts(db, slugs) {
	if (!slugs.length) return new Map();
	const { results } = await failedReminderCountsStatement(db, slugs).all();
	return readFailedReminderCounts(results);
}

/**
 * La consulta de {@link failedReminderCounts} (para correrla en una tanda). `slugs` no vacío.
 *
 * @param {D1Database} db
 * @param {string[]} slugs
 */
export function failedReminderCountsStatement(db, slugs) {
	return db
		.prepare(
			`SELECT o.event_slug AS slug, COUNT(*) AS n FROM reminder_sends s
			JOIN orders o ON o.id = s.order_id
			WHERE s.status = 'failed' AND o.status = 'approved'
				AND o.event_slug IN (${slugs.map((_, i) => `?${i + 1}`).join(', ')})
			GROUP BY o.event_slug`
		)
		.bind(...slugs);
}

/**
 * @param {Record<string, unknown>[]} rows lo que devolvió {@link failedReminderCountsStatement}
 * @returns {Map<string, number>}
 */
export function readFailedReminderCounts(rows) {
	/** @type {Map<string, number>} */
	const out = new Map();
	for (const r of rows) out.set(String(r.slug), Number(r.n));
	return out;
}

/**
 * "Reintentar" desde el panel: los recordatorios que fallaron de un evento vuelven a la cola
 * (con sus intentos en cero). Devuelve cuántos.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 */
export async function retryFailedReminders(db, eventSlug) {
	const res = await db
		.prepare(
			`UPDATE reminder_sends SET status = 'retry', attempts = 0
			WHERE status = 'failed'
				AND order_id IN (SELECT id FROM orders WHERE event_slug = ?1 AND status = 'approved')`
		)
		.bind(eventSlug)
		.run();
	return res.meta.changes ?? 0;
}

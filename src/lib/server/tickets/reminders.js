/**
 * Recordatorios por mail antes de cada evento con entradas.
 *
 * - Qué recordatorios hay se configura en /admin/entradas/ajustes (se guarda como JSON en
 *   `ticket_settings`, clave `reminders`). Cada uno: activado o no, y cuándo:
 *   - `hours_before`: N horas antes del comienzo ("2 días antes" = 48 h);
 *   - `day_at`: N días antes (0 = el mismo día) a una hora fija, en horario de Argentina.
 *   Por defecto: 48 h antes y el mismo día a las 9:00.
 * - Un evento puede no mandarlos con `recordatorios: false` en el frontmatter.
 * - Los manda POST /api/cron/recordatorios (lo llama cada 15 minutos el Worker de
 *   workers/cron/). Idempotente: `reminder_sends` (orden + id del recordatorio) se reserva antes
 *   de mandar; si el envío falla, se libera para reintentar en la próxima corrida.
 * - Solo a órdenes aprobadas (no canceladas ni reembolsadas), de eventos que todavía no
 *   empezaron, y compradas antes de que el recordatorio "venciera" (quien compra una hora antes
 *   del evento ya tiene el mail de las entradas: no le llega el de "faltan 2 días").
 */

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
 * Órdenes a las que les toca un recordatorio ahora.
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
	for (const e of events) {
		if (!e.reminders || e.cancelled || !(e.start > now)) continue;
		for (const r of reminders) {
			if (!r.enabled) continue;
			const due = reminderDueAt(r, e.start);
			if (due > now || due >= e.start) continue;
			const id = reminderId(r);
			const { results } = await db
				.prepare(
					`SELECT o.* FROM orders o WHERE o.event_slug = ?1 AND o.status = 'approved'
						AND o.created_at < ?2
						AND NOT EXISTS (SELECT 1 FROM reminder_sends s WHERE s.order_id = o.id AND s.reminder_id = ?3)
					ORDER BY o.created_at`
				)
				.bind(e.slug, due, id)
				.all();
			for (const order of /** @type {import('./orders.js').Order[]} */ (results)) {
				out.push({ order, reminder: r, id, slug: e.slug });
			}
		}
	}
	return out;
}

/**
 * Manda los recordatorios que tocan (idempotente: ver arriba).
 *
 * @param {D1Database} db
 * @param {{
 *   events: { slug: string, start: number, reminders: boolean, cancelled: boolean }[],
 *   reminders: Reminder[],
 *   now?: number,
 *   send: (order: import('./orders.js').Order, reminder: Reminder) => Promise<boolean>
 * }} input
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendDueReminders(db, { events, reminders, now = Date.now(), send }) {
	let sent = 0;
	let failed = 0;
	for (const { order, reminder, id } of await dueReminderOrders(db, { events, reminders, now })) {
		const claim = await db
			.prepare(
				'INSERT OR IGNORE INTO reminder_sends (order_id, reminder_id, sent_at) VALUES (?1, ?2, ?3)'
			)
			.bind(order.id, id, now)
			.run();
		if (claim.meta.changes !== 1) continue;
		let ok = false;
		try {
			ok = await send(order, reminder);
		} catch (error) {
			console.error(`[tickets] no se pudo mandar el recordatorio ${id} de ${order.id}:`, error);
		}
		if (ok) sent++;
		else {
			failed++;
			await db
				.prepare('DELETE FROM reminder_sends WHERE order_id = ?1 AND reminder_id = ?2')
				.bind(order.id, id)
				.run();
		}
	}
	return { sent, failed };
}

/**
 * «Avisar a les compradores» cuando cambia la fecha de un evento (docs/mails.md).
 *
 * - Al guardar el evento en el panel con otro inicio o fin, {@link recordDateChange} anota el
 *   cambio en `event_date_changes` (migración 0048): cuándo, la fecha de antes y la nueva. NO
 *   manda nada: el panel lo ofrece ({@link dateChangeOffer}) y une admin tiene que tocar «Avisar
 *   a les compradores» y confirmar.
 * - El aviso le llega a cada orden aprobada (con mail) de antes del cambio; las reembolsadas,
 *   canceladas o sin pagar no. Una por orden y versión (`date_change_sends`, con el mismo
 *   estado que los demás envíos en tandas: ver sendState.js): tocar dos veces no manda dos veces,
 *   y un cambio nuevo (otra versión) se puede volver a avisar.
 * - Se manda en tandas: el botón manda la primera y deja el envío pedido
 *   (`send_requested_at`); el cron sigue con el resto (mailQueue.js).
 * - La versión es el minuto siguiente al cambio: el .ics del aviso tiene el mismo UID y un
 *   SEQUENCE más alto que el de cualquier mail anterior, así el calendario reemplaza la entrada.
 */
import { eventEnd } from '$lib/utils/dates.js';
import { readEventFields, splitMarkdown } from '$lib/utils/eventDraft.js';
import { DEFAULT_MAIL_BATCH_SIZE } from './batchSize.js';
import { STALE_CLAIM_MS, expireStaleClaims, pendingSendSql, sendBatch } from './sendState.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {{ start: string | null, end: string | null }} Schedule
 * Inicio y fin de un evento, tal como están en su archivo (texto ISO; `null` si no hay).
 */

/**
 * @typedef {{
 *   event_slug: string, changed_at: number, version: number,
 *   old_start: string | null, old_end: string | null, new_start: string, new_end: string | null,
 *   changed_by: string, send_requested_at: number | null, send_requested_by: string | null,
 *   send_done_at: number | null, dismissed_at: number | null
 * }} DateChange
 */

const MINUTE = 60_000;

/** @param {unknown} v */
const text = (v) => (v === undefined || v === null || v === '' ? null : String(v));

/**
 * Inicio y fin en ms (fin: `eventEnd`, que arregla un fin pasada la medianoche con la fecha del
 * inicio). `null` si no hay fecha válida.
 *
 * @param {Schedule} s
 */
function times(s) {
	const start = s.start ? Date.parse(s.start) : NaN;
	if (!Number.isFinite(start)) return null;
	const end = s.end ? eventEnd(s.start ?? '', s.end).getTime() : null;
	return { start, end: end !== null && Number.isFinite(end) ? end : null };
}

/**
 * ¿Cambió el inicio o el fin? Se comparan los instantes (no el texto: `22:00-03:00` y `01:00Z`
 * son lo mismo). De sin fecha a con fecha no es un cambio (no había nada que avisar).
 *
 * @param {Schedule | null | undefined} before
 * @param {Schedule | null | undefined} after
 */
export function scheduleChanged(before, after) {
	const a = before ? times(before) : null;
	const b = after ? times(after) : null;
	if (!a || !b) return false;
	return a.start !== b.start || a.end !== b.end;
}

/**
 * El inicio y el fin del archivo de un evento (o `null` si no se puede leer).
 *
 * @param {string | null | undefined} raw
 * @returns {Schedule | null}
 */
export function scheduleFromFile(raw) {
	if (typeof raw !== 'string') return null;
	try {
		const f = readEventFields(splitMarkdown(raw).frontmatter);
		return { start: text(f.start), end: text(f.end) };
	} catch {
		return null;
	}
}

/**
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<DateChange | null>}
 */
export async function getDateChange(db, eventSlug) {
	const row = await db
		.prepare('SELECT * FROM event_date_changes WHERE event_slug = ?1')
		.bind(eventSlug)
		.first();
	if (!row) return null;
	return /** @type {DateChange} */ ({
		...row,
		changed_at: Number(row.changed_at),
		version: Number(row.version)
	});
}

/**
 * ¿Ya se le mandó (o se está mandando) esta versión a alguien?
 *
 * @param {D1Database} db
 * @param {number} version
 */
async function anySent(db, version) {
	const row = await db
		.prepare('SELECT 1 AS x FROM date_change_sends WHERE version = ?1 LIMIT 1')
		.bind(version)
		.first();
	return Boolean(row);
}

/**
 * Anota un cambio de fecha (o nada, si no cambió). La fecha «de antes» es la que tenían les
 * compradores: si el cambio anterior todavía no se avisó a nadie, se queda la de ese (cambiar
 * dos veces seguidas avisa «de la original a la última»); y si se volvió a la fecha original sin
 * avisar, el cambio se borra (no hay nada que avisar).
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, before: Schedule | null, after: Schedule | null, by: string,
 *   now?: number }} input
 * @returns {Promise<DateChange | null>} el cambio anotado, o `null` si no hay nada que avisar
 */
export async function recordDateChange(db, { eventSlug, before, after, by, now = Date.now() }) {
	if (!before || !after || !scheduleChanged(before, after)) return null;
	const prev = await getDateChange(db, eventSlug);
	let old = before;
	if (prev && prev.send_requested_at === null && !(await anySent(db, prev.version))) {
		old = { start: prev.old_start, end: prev.old_end };
		if (!scheduleChanged(old, after)) {
			await db
				.prepare('DELETE FROM event_date_changes WHERE event_slug = ?1 AND version = ?2')
				.bind(eventSlug, prev.version)
				.run();
			return null;
		}
	}
	// El minuto siguiente (y siempre más que el cambio anterior): un SEQUENCE más alto que el de
	// cualquier mail que ya salió.
	const version = Math.max(
		(Math.floor(now / MINUTE) + 1) * MINUTE,
		prev ? prev.version + MINUTE : 0
	);
	await db
		.prepare(
			`INSERT INTO event_date_changes (event_slug, changed_at, version, old_start, old_end,
				new_start, new_end, changed_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
			ON CONFLICT (event_slug) DO UPDATE SET changed_at = ?2, version = ?3, old_start = ?4,
				old_end = ?5, new_start = ?6, new_end = ?7, changed_by = ?8,
				send_requested_at = NULL, send_requested_by = NULL, send_done_at = NULL,
				dismissed_at = NULL`
		)
		.bind(
			eventSlug,
			now,
			version,
			old.start,
			old.end,
			/** @type {string} */ (after.start),
			after.end,
			by
		)
		.run();
	return getDateChange(db, eventSlug);
}

/**
 * Órdenes aprobadas, con mail, de antes del cambio, que todavía no recibieron este aviso. Sin
 * `includeFailed`, las que fallaron todos sus intentos no cuentan (el cron no las reintenta
 * solo); con `includeFailed` sí (el botón las reintenta).
 *
 * @param {D1Database} db
 * @param {Pick<DateChange, 'event_slug' | 'changed_at' | 'version'>} change
 * @param {{ now?: number, includeFailed?: boolean }} [options]
 * @returns {Promise<import('./orders.js').Order[]>}
 */
export async function dateChangeRecipients(
	db,
	change,
	{ now = Date.now(), includeFailed = false } = {}
) {
	const { results } = await db
		.prepare(
			`SELECT o.* FROM orders o WHERE o.event_slug = ?1 AND o.status = 'approved'
				AND o.buyer_email IS NOT NULL AND TRIM(o.buyer_email) != '' AND o.created_at < ?4
				AND ${pendingSendSql('date_change_sends', { key: 2, stale: 3, includeFailed })}
			ORDER BY o.created_at`
		)
		.bind(change.event_slug, change.version, now - STALE_CLAIM_MS, change.changed_at)
		.all();
	return /** @type {import('./orders.js').Order[]} */ (results);
}

/**
 * Cuántas personas distintas (por mail, sin mayúsculas) hay en una lista de órdenes.
 * @param {import('./orders.js').Order[]} orders
 */
const people = (orders) => new Set(orders.map((o) => o.buyer_email.trim().toLowerCase())).size;

/**
 * Lo que el panel ofrece sobre el último cambio de fecha, o `null` si no hay nada para ofrecer
 * (sin cambio, o nadie que haya comprado antes).
 *
 * - `people` / `orders`: a quiénes les falta el aviso (incluye a quienes fallaron: el botón los
 *   reintenta);
 * - `notified`: a cuántas órdenes ya les llegó;
 * - `notice`: si va el aviso de arriba de la ficha (falta avisar, nadie tocó «Avisar» ni «No hace
 *   falta», y el evento no terminó). La pestaña «Mail a compradores» lo ofrece igual.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {{ now?: number, cancelled?: boolean }} [options]
 */
export async function dateChangeOffer(db, eventSlug, { now = Date.now(), cancelled = false } = {}) {
	const change = await getDateChange(db, eventSlug);
	if (!change || cancelled) return null;
	const pending = await dateChangeRecipients(db, change, { now, includeFailed: true });
	const sentRow = await db
		.prepare(
			`SELECT COUNT(*) AS n FROM date_change_sends s JOIN orders o ON o.id = s.order_id
			WHERE s.version = ?1 AND s.status = 'sent' AND o.event_slug = ?2`
		)
		.bind(change.version, eventSlug)
		.first();
	const notified = Number(sentRow?.n ?? 0);
	if (!pending.length && !notified) return null;
	const end = times({ start: change.new_start, end: change.new_end });
	const over = end ? (end.end ?? end.start) < now : false;
	return {
		version: change.version,
		changedAt: change.changed_at,
		changedBy: change.changed_by,
		oldStart: change.old_start,
		oldEnd: change.old_end,
		newStart: change.new_start,
		newEnd: change.new_end,
		people: people(pending),
		orders: pending.length,
		notified,
		requested: change.send_requested_at !== null,
		dismissed: change.dismissed_at !== null,
		over,
		notice:
			pending.length > 0 &&
			change.send_requested_at === null &&
			change.dismissed_at === null &&
			!over
	};
}

/**
 * «Avisar a les compradores»: deja pedido el envío de ESTA versión (el cron sigue mandando
 * tandas hasta terminar) y vuelve a la cola a quienes ya habían fallado todos sus intentos.
 * `false` si el cambio ya no es ese (hubo otro cambio después: hay que mirar el nuevo).
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, version: number, by: string, now?: number }} input
 */
export async function requestDateChangeSend(db, { eventSlug, version, by, now = Date.now() }) {
	const [res] = await db.batch([
		db
			.prepare(
				`UPDATE event_date_changes SET send_requested_at = COALESCE(send_requested_at, ?3),
					send_requested_by = COALESCE(send_requested_by, ?4), send_done_at = NULL
				WHERE event_slug = ?1 AND version = ?2`
			)
			.bind(eventSlug, version, now, by),
		db
			.prepare(
				`UPDATE date_change_sends SET status = 'retry', attempts = 0
				WHERE version = ?2 AND status = 'failed'
					AND order_id IN (SELECT id FROM orders WHERE event_slug = ?1)`
			)
			.bind(eventSlug, version)
	]);
	return res.meta.changes === 1;
}

/**
 * «No hace falta avisar»: el aviso de arriba de la ficha no se muestra más para este cambio.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, version: number, now?: number }} input
 */
export async function dismissDateChange(db, { eventSlug, version, now = Date.now() }) {
	const res = await db
		.prepare(
			`UPDATE event_date_changes SET dismissed_at = ?3
			WHERE event_slug = ?1 AND version = ?2 AND dismissed_at IS NULL`
		)
		.bind(eventSlug, version, now)
		.run();
	return res.meta.changes === 1;
}

/**
 * Avisos de cambio de fecha pedidos y sin terminar (para el cron), del más viejo al más nuevo.
 *
 * @param {D1Database} db
 * @returns {Promise<DateChange[]>}
 */
export async function pendingDateChangeRequests(db) {
	const { results } = await db
		.prepare(
			`SELECT * FROM event_date_changes
			WHERE send_requested_at IS NOT NULL AND send_done_at IS NULL
			ORDER BY send_requested_at`
		)
		.all();
	return results.map(
		(r) =>
			/** @type {DateChange} */ ({
				...r,
				changed_at: Number(r.changed_at),
				version: Number(r.version)
			})
	);
}

/**
 * Manda una tanda del aviso: como mucho `limit` mails a órdenes que todavía no lo recibieron.
 * Idempotente por orden y versión (ver sendState.js). Cuando no queda nadie (salvo quienes
 * fallaron todos sus intentos), el pedido se da por terminado.
 *
 * @param {D1Database} db
 * @param {{
 *   change: DateChange,
 *   send: (order: import('./orders.js').Order) => Promise<boolean>,
 *   limit?: number,
 *   now?: number
 * }} input
 * @returns {Promise<{ sent: number, failed: number, remaining: number, gaveUp: number }>}
 */
export async function sendDateChangeBatch(
	db,
	{ change, send, limit = DEFAULT_MAIL_BATCH_SIZE, now = Date.now() }
) {
	await expireStaleClaims(db, 'date_change_sends', now);
	const items = await dateChangeRecipients(db, change, { now });
	const r = await sendBatch(db, 'date_change_sends', {
		items,
		limit,
		now,
		label: 'el aviso de cambio de fecha',
		claim: (order) => ({ orderId: order.id, key: change.version }),
		send
	});
	const remaining = (await dateChangeRecipients(db, change, { now })).length;
	if (remaining === 0) {
		await db
			.prepare(
				`UPDATE event_date_changes SET send_done_at = ?3
				WHERE event_slug = ?1 AND version = ?2 AND send_requested_at IS NOT NULL
					AND send_done_at IS NULL`
			)
			.bind(change.event_slug, change.version, now)
			.run();
	}
	const gaveUp =
		(await dateChangeRecipients(db, change, { now, includeFailed: true })).length - remaining;
	return { sent: r.sent, failed: r.failed, remaining, gaveUp };
}

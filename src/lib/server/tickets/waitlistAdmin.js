/**
 * La lista de espera en el panel (docs/tickets.md, «Lista de espera»): lo que leen la vista
 * «Lista de espera» de la ficha del evento, su CSV, la nota de la puerta y de la carga a mano, el
 * editor (que no deja cambiar el alcance con gente anotada) y «Para revisar» (mails que no
 * salieron). Y las acciones del panel que no son un cambio de una sola anotación: cerrar la lista
 * y volver a probar los mails que no salieron.
 *
 * Los cambios de una anotación están en ./waitlist.js; el motor, en ./waitlistEngine.js.
 * Los mails de la gente solo los ve el panel (como las órdenes): nunca van a los logs ni al
 * registro de actividad.
 */
import { rowsOf } from '$lib/server/db/batch.js';
import { LIVE_STATUSES } from './waitlist.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

const LIVE_SQL = `(${LIVE_STATUSES.map((s) => `'${s}'`).join(',')})`;

/** Cuántas anotaciones terminadas muestra la pestaña (el CSV trae todas). */
export const ENDED_SHOWN = 200;

/**
 * Las anotaciones vivas (sin confirmar, esperando o con un lugar ofrecido) por alcance: '' = todo
 * el evento, si no el id del tipo. El editor no deja apagar la lista, cambiar el alcance ni sacar
 * un tipo mientras haya alguna.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<Record<string, number>>}
 */
export async function waitlistLiveByScope(db, eventSlug) {
	const { results } = await db
		.prepare(
			`SELECT COALESCE(ticket_type, '') AS scope, COUNT(*) AS n FROM waitlist_entries
			WHERE event_slug = ?1 AND status IN ${LIVE_SQL}
			GROUP BY COALESCE(ticket_type, '')`
		)
		.bind(eventSlug)
		.all();
	return Object.fromEntries(results.map((r) => [String(r.scope), Number(r.n)]));
}

/**
 * @typedef {{
 *   waiting: number, offered: number, broadcast: number, nextHoldUntil: number | null,
 *   purchased: number, expired: number, left: number, removed: number, pending: number,
 *   failedMails: number
 * }} ScopeCounts
 * - `offered`: con un lugar guardado vigente (`nextHoldUntil`: el que vence primero);
 * - `broadcast`: avisades en el aviso a todes (sin lugar guardado);
 * - `left`: salieron con el link del mail; `removed`: les sacó une admin;
 * - `pending`: anotades sin confirmar el mail.
 */

/** @returns {ScopeCounts} */
const emptyCounts = () => ({
	waiting: 0,
	offered: 0,
	broadcast: 0,
	nextHoldUntil: null,
	purchased: 0,
	expired: 0,
	left: 0,
	removed: 0,
	pending: 0,
	failedMails: 0
});

/**
 * @typedef {{
 *   id: string, ticketType: string | null, email: string, status: string,
 *   position: number | null, createdAt: number, confirmedAt: number | null,
 *   offeredAt: number | null, holdUntil: number | null, offerCount: number,
 *   orderId: string | null, orderStatus: string | null, endedAt: number | null,
 *   endReason: string | null, endedBy: string | null, failedMails: number
 * }} PanelEntry
 * `position`: el lugar en la fila de su alcance (solo `waiting`, desde 1).
 */

/** @param {Record<string, unknown>} r @returns {PanelEntry} */
function entryOf(r) {
	/** @param {unknown} v */
	const num = (v) => (v == null ? null : Number(v));
	return {
		id: String(r.id),
		ticketType: r.ticket_type == null ? null : String(r.ticket_type),
		email: String(r.email),
		status: String(r.status),
		position: null,
		createdAt: Number(r.created_at),
		confirmedAt: num(r.confirmed_at),
		offeredAt: num(r.offered_at),
		holdUntil: num(r.hold_until),
		offerCount: Number(r.offer_count ?? 0),
		orderId: r.order_id == null ? null : String(r.order_id),
		orderStatus: r.order_status == null ? null : String(r.order_status),
		endedAt: num(r.ended_at),
		endReason: r.end_reason == null ? null : String(r.end_reason),
		endedBy: r.ended_by == null ? null : String(r.ended_by),
		failedMails: Number(r.failed_mails ?? 0)
	};
}

const ENTRY_COLUMNS = `e.id, e.ticket_type, e.email, e.status, e.created_at, e.confirmed_at,
	e.offered_at, e.hold_until, e.offer_count, e.order_id, o.status AS order_status, e.ended_at,
	e.end_reason, e.ended_by,
	(SELECT COUNT(*) FROM waitlist_sends s WHERE s.entry_id = e.id AND s.status = 'failed')
		AS failed_mails`;

/**
 * El orden de la pestaña: primero lo vivo (con lugar ofrecido, después la fila en su orden, después
 * sin confirmar), después lo comprado y al final lo terminado (lo último primero).
 */
const PANEL_ORDER = `CASE e.status WHEN 'offered' THEN 0 WHEN 'waiting' THEN 1
		WHEN 'pending_confirmation' THEN 2 WHEN 'purchased' THEN 3 ELSE 4 END,
	CASE WHEN e.status IN ('waiting', 'offered') THEN e.confirmed_at END,
	CASE WHEN e.status IN ('waiting', 'offered') THEN e.id END,
	COALESCE(e.ended_at, e.updated_at) DESC, e.id`;

/**
 * Todo lo de la vista Ventas › Lista de espera de un evento: las cuentas por alcance y las anotaciones
 * (las vivas y compradas todas; de las terminadas, las últimas {@link ENDED_SHOWN}).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ scopes: Record<string, ScopeCounts>, entries: PanelEntry[],
 *   endedHidden: number }>}
 */
export async function waitlistPanel(db, eventSlug, { now = Date.now() } = {}) {
	const [live, ended, counted] = await db.batch([
		db
			.prepare(
				`SELECT ${ENTRY_COLUMNS} FROM waitlist_entries e LEFT JOIN orders o ON o.id = e.order_id
				WHERE e.event_slug = ?1 AND e.status IN ('pending_confirmation','waiting','offered','purchased')
				ORDER BY ${PANEL_ORDER}`
			)
			.bind(eventSlug),
		db
			.prepare(
				`SELECT ${ENTRY_COLUMNS} FROM waitlist_entries e LEFT JOIN orders o ON o.id = e.order_id
				WHERE e.event_slug = ?1 AND e.status IN ('expired','cancelled')
				ORDER BY ${PANEL_ORDER} LIMIT ?2`
			)
			.bind(eventSlug, ENDED_SHOWN),
		db
			.prepare(
				`SELECT COALESCE(e.ticket_type, '') AS scope,
					SUM(e.status = 'waiting') AS waiting,
					SUM(e.status = 'offered' AND e.hold_until > ?2) AS offered,
					SUM(e.status = 'offered' AND e.hold_until IS NULL) AS broadcast,
					MIN(CASE WHEN e.status = 'offered' AND e.hold_until > ?2 THEN e.hold_until END)
						AS next_hold,
					SUM(e.status = 'purchased') AS purchased,
					SUM(e.status = 'expired') AS expired,
					SUM(e.status = 'cancelled' AND e.end_reason = 'left') AS left_list,
					SUM(e.status = 'cancelled' AND e.end_reason = 'admin') AS removed,
					SUM(e.status = 'pending_confirmation') AS pending,
					SUM((SELECT COUNT(*) FROM waitlist_sends s
						WHERE s.entry_id = e.id AND s.status = 'failed')) AS failed_mails
				FROM waitlist_entries e WHERE e.event_slug = ?1
				GROUP BY COALESCE(e.ticket_type, '')`
			)
			.bind(eventSlug, now)
	]);
	/** @type {Record<string, ScopeCounts>} */
	const scopes = {};
	for (const r of /** @type {Record<string, unknown>[]} */ (counted.results)) {
		scopes[String(r.scope)] = {
			waiting: Number(r.waiting ?? 0),
			offered: Number(r.offered ?? 0),
			broadcast: Number(r.broadcast ?? 0),
			nextHoldUntil: r.next_hold == null ? null : Number(r.next_hold),
			purchased: Number(r.purchased ?? 0),
			expired: Number(r.expired ?? 0),
			left: Number(r.left_list ?? 0),
			removed: Number(r.removed ?? 0),
			pending: Number(r.pending ?? 0),
			failedMails: Number(r.failed_mails ?? 0)
		};
	}
	const entries = [
		.../** @type {Record<string, unknown>[]} */ (live.results),
		.../** @type {Record<string, unknown>[]} */ (ended.results)
	].map(entryOf);
	// El lugar en la fila de cada alcance.
	/** @type {Map<string, number>} */
	const seen = new Map();
	for (const e of entries) {
		if (e.status !== 'waiting') continue;
		const k = e.ticketType ?? '';
		const n = (seen.get(k) ?? 0) + 1;
		seen.set(k, n);
		e.position = n;
	}
	const totalEnded = Object.values(scopes).reduce(
		(sum, c) => sum + c.expired + c.left + c.removed,
		0
	);
	return { scopes, entries, endedHidden: Math.max(0, totalEnded - ended.results.length) };
}

/** Una cuenta vacía (para un alcance sin anotaciones). */
export { emptyCounts as emptyScopeCounts };

/**
 * Todas las anotaciones de un evento, en el orden de la pestaña (para el CSV).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<PanelEntry[]>}
 */
export async function waitlistEntriesForCsv(db, eventSlug) {
	const { results } = await db
		.prepare(
			`SELECT ${ENTRY_COLUMNS} FROM waitlist_entries e LEFT JOIN orders o ON o.id = e.order_id
			WHERE e.event_slug = ?1 ORDER BY ${PANEL_ORDER}`
		)
		.bind(eventSlug)
		.all();
	const entries = results.map(entryOf);
	/** @type {Map<string, number>} */
	const seen = new Map();
	for (const e of entries) {
		if (e.status !== 'waiting') continue;
		const k = e.ticketType ?? '';
		seen.set(k, (seen.get(k) ?? 0) + 1);
		e.position = seen.get(k) ?? null;
	}
	return entries;
}

/** Cómo se nombra cada estado en el panel y en el CSV. */
export const WAITLIST_STATUS_LABELS = Object.freeze({
	pending_confirmation: 'Sin confirmar',
	waiting: 'Esperando',
	offered: 'Con lugar ofrecido',
	purchased: 'Compró',
	expired: 'Terminó',
	cancelled: 'Salió'
});

/** Por qué terminó una anotación. */
export const WAITLIST_END_LABELS = Object.freeze({
	hold_expired: 'se le venció la reserva',
	left: 'salió con el link del mail',
	admin: 'desde el panel',
	closed: 'se cerró la lista',
	event_cancelled: 'se canceló el evento',
	type_removed: 'ya no existe su tipo de entrada'
});

/**
 * Lo que muestran la puerta y la carga a mano: cuántas personas esperan y cuántas tienen un lugar
 * guardado (y hasta cuándo vence el primero). `null` si no hay nadie (no se muestra nada).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ waiting: number, offered: number, nextHoldUntil: number | null } | null>}
 */
export async function waitlistSummary(db, eventSlug, { now = Date.now() } = {}) {
	const row = await db
		.prepare(
			`SELECT SUM(status = 'waiting') AS waiting,
				SUM(status = 'offered' AND hold_until > ?2) AS offered,
				MIN(CASE WHEN status = 'offered' AND hold_until > ?2 THEN hold_until END) AS next_hold
			FROM waitlist_entries
			WHERE event_slug = ?1 AND (status = 'waiting' OR (status = 'offered' AND hold_until > ?2))`
		)
		.bind(eventSlug, now)
		.first();
	const waiting = Number(row?.waiting ?? 0);
	const offered = Number(row?.offered ?? 0);
	if (!waiting && !offered) return null;
	return {
		waiting,
		offered,
		nextHoldUntil: row?.next_hold == null ? null : Number(row.next_hold)
	};
}

/**
 * Lo mismo que {@link waitlistSummary} pero sin romper nunca la página: sin base, sin la
 * migración 0053 o con un error, `null` (la nota no aparece).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} eventSlug
 * @param {{ enabled: boolean, now?: number }} opts `enabled`: el interruptor `lista_espera`
 */
export async function safeWaitlistSummary(db, eventSlug, { enabled, now }) {
	if (!db || !enabled) return null;
	try {
		return await waitlistSummary(db, eventSlug, { now });
	} catch (error) {
		console.error('[lista de espera] no se pudo leer la fila para la nota:', error);
		return null;
	}
}

/**
 * «Cerrar la lista» desde el panel: quien espera o tiene un lugar ofrecido pasa a `expired`
 * (`closed`, y le llega el mail «se cerró la lista»); las anotaciones sin confirmar se borran
 * (nunca dieron su consentimiento). Las que ya compraron quedan como están.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {{ by: string, now?: number }} opts
 * @returns {Promise<{ closed: number, deleted: number }>}
 */
export async function closeWaitlist(db, eventSlug, { by, now = Date.now() }) {
	const [closed, deleted] = await db.batch([
		db
			.prepare(
				`UPDATE waitlist_entries
				SET status = 'expired', end_reason = 'closed', ended_by = ?2, ended_at = ?3,
					updated_at = ?3, offer_token_hash = NULL
				WHERE event_slug = ?1 AND status IN ('waiting', 'offered')`
			)
			.bind(eventSlug, by, now),
		db
			.prepare(
				`DELETE FROM waitlist_entries
				WHERE event_slug = ?1 AND status = 'pending_confirmation'`
			)
			.bind(eventSlug)
	]);
	return {
		closed: Number(closed.meta?.changes ?? 0),
		deleted: Number(deleted.meta?.changes ?? 0)
	};
}

/**
 * «Volver a probar»: borra las marcas de los mails de la lista de este evento que no salieron
 * (`waitlist_sends.status = 'failed'`), así la próxima tanda los vuelve a mandar si todavía
 * corresponden (una oferta vigente, una reserva vencida o un cierre de las últimas 48 h). Los que
 * ya no corresponden dejan de contar en «Para revisar». Devuelve cuántas marcas cambió.
 *
 * La marca de «se terminó tu lugar» (una reserva terminada por admin, `queueEndedMail` en
 * waitlistEngine.js) no se borra, porque es lo que pide ese mail: vuelve a `retry`, sin intentos.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} [now]
 */
export async function retryFailedWaitlistMails(db, eventSlug, now = Date.now()) {
	const ended = `kind = 'expired' AND entry_id IN (SELECT id FROM waitlist_entries
		WHERE event_slug = ?1 AND end_reason = 'admin')`;
	const [reset, removed] = await db.batch([
		db
			.prepare(
				`UPDATE waitlist_sends SET status = 'retry', attempts = 0, sent_at = ?2
				WHERE status = 'failed' AND ${ended}`
			)
			.bind(eventSlug, now),
		db
			.prepare(
				`DELETE FROM waitlist_sends WHERE status = 'failed'
				AND entry_id IN (SELECT id FROM waitlist_entries WHERE event_slug = ?1)`
			)
			.bind(eventSlug)
	]);
	return Number(reset.meta?.changes ?? 0) + Number(removed.meta?.changes ?? 0);
}

/**
 * La anotación `id` de este evento (para que una acción del panel no toque la de otro), o `null`.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} id
 */
export async function panelEntry(db, eventSlug, id) {
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	const row = await db
		.prepare(
			`SELECT id, ticket_type, status FROM waitlist_entries WHERE id = ?1 AND event_slug = ?2`
		)
		.bind(id, eventSlug)
		.first();
	if (!row) return null;
	return {
		id: String(row.id),
		ticketType: row.ticket_type == null ? null : String(row.ticket_type),
		status: String(row.status)
	};
}

/**
 * «Para revisar»: los mails de la lista de espera que no salieron (después de los reintentos), con
 * los eventos donde pasó (el más reciente primero). Una sola fila en la tarjeta del Inicio.
 *
 * @returns {import('$lib/server/db/batch.js').BatchQuery<{ count: number, slugs: string[] } | null>}
 */
export function failedWaitlistMailsQuery() {
	return {
		what: 'inicio: mails de la lista de espera que no salieron',
		fallback: null,
		statements: (db) => [
			db.prepare(
				`SELECT e.event_slug AS slug, COUNT(*) AS n, MAX(s.sent_at) AS last
				FROM waitlist_sends s JOIN waitlist_entries e ON e.id = s.entry_id
				WHERE s.status = 'failed'
				GROUP BY e.event_slug ORDER BY last DESC`
			)
		],
		read: (results) => {
			const rows = rowsOf(results);
			return {
				count: rows.reduce((sum, r) => sum + Number(r.n ?? 0), 0),
				slugs: rows.map((r) => String(r.slug))
			};
		}
	};
}

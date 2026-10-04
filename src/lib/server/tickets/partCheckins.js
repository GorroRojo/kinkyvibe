/**
 * Ingreso por parte en los talleres en varias partes (docs/talleres-partes.md).
 *
 * Con una sola entrada para todo el taller (lo que viene por defecto), las entradas son del taller
 * (`tickets.event_slug` = el taller, que es la parte 1) y el modo puerta de cada una de las otras
 * partes marca el ingreso en `ticket_part_checkins` (migración 0039), una fila por entrada y
 * parte. El ingreso de la parte 1 sigue siendo `tickets.checked_in_at`, como en cualquier evento.
 *
 * Mismas reglas que el ingreso de siempre (orders.js `checkIn`, door.js `applyQueuedCheckIns`): una
 * sola sentencia condicional (si dos personas escanean a la vez, gana una), solo entradas de
 * órdenes aprobadas y de ESTE taller, y nunca se pisa un ingreso ya marcado.
 *
 * Cuál es la parte y de qué taller son las entradas lo decide quien llama (`doorContext`, con
 * src/lib/server/eventos/partes.js); acá solo se recibe `ticketSlug` (el taller) y `partSlug`.
 */
import { getTicketByToken, isValidToken } from './orders.js';
import { QUEUE_MAX_AGE_MS, ticketWithBuyer } from './door.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @param {D1Database} db
 * @param {string} ticketId
 * @param {string} partSlug
 * @returns {Promise<{ checked_in_at: number, checked_in_by: string } | null>}
 */
async function partRow(db, ticketId, partSlug) {
	const row = await db
		.prepare(
			'SELECT checked_in_at, checked_in_by FROM ticket_part_checkins WHERE ticket_id = ?1 AND part_slug = ?2'
		)
		.bind(ticketId, partSlug)
		.first();
	return row
		? { checked_in_at: Number(row.checked_in_at), checked_in_by: String(row.checked_in_by) }
		: null;
}

/**
 * La sentencia que marca el ingreso a una parte si todavía no estaba marcado (y la entrada es de
 * una orden aprobada del taller). Devuelve la fila nueva, o nada.
 *
 * @param {D1Database} db
 * @param {{ token: string, ticketSlug: string, partSlug: string, at: number, by: string }} input
 */
function insertPartCheckIn(db, { token, ticketSlug, partSlug, at, by }) {
	return db
		.prepare(
			`INSERT INTO ticket_part_checkins (ticket_id, part_slug, checked_in_at, checked_in_by)
			SELECT t.id, ?3, ?4, ?5 FROM tickets t JOIN orders o ON o.id = t.order_id
			WHERE t.token = ?1 AND t.event_slug = ?2 AND o.status = 'approved'
			ON CONFLICT (ticket_id, part_slug) DO NOTHING
			RETURNING ticket_id`
		)
		.bind(token, ticketSlug, partSlug, at, by);
}

/**
 * Marca el ingreso de una entrada del taller a una parte. Mismos resultados que `checkIn`
 * (orders.js): `ok`, `already`, `void`, `wrong-event` o `invalid`. La entrada que devuelve trae
 * en `checked_in_at`/`checked_in_by` el ingreso a ESTA parte (lo que muestra la pantalla).
 *
 * @param {D1Database} db
 * @param {{ token: string, ticketSlug: string, partSlug: string, by: string, now?: number }} input
 */
export async function checkInPart(db, { token, ticketSlug, partSlug, by, now = Date.now() }) {
	if (!isValidToken(token)) return { result: /** @type {const} */ ('invalid'), ticket: null };
	const inserted = await insertPartCheckIn(db, {
		token,
		ticketSlug,
		partSlug,
		at: now,
		by
	}).first();
	const ticket = await getTicketByToken(db, token);
	if (!ticket) return { result: /** @type {const} */ ('invalid'), ticket: null };
	if (ticket.event_slug !== ticketSlug)
		return { result: /** @type {const} */ ('wrong-event'), ticket };
	const part = await partRow(db, ticket.id, partSlug);
	const withPart = {
		...ticket,
		checked_in_at: part?.checked_in_at ?? null,
		checked_in_by: part?.checked_in_by ?? null
	};
	if (inserted) return { result: /** @type {const} */ ('ok'), ticket: withPart };
	if (ticket.order_status !== 'approved')
		return { result: /** @type {const} */ ('void'), ticket: withPart };
	return { result: /** @type {const} */ ('already'), ticket: withPart };
}

/**
 * Deshace el ingreso a una parte. `true` si había uno.
 *
 * @param {D1Database} db
 * @param {{ ticketId: string, ticketSlug: string, partSlug: string }} input
 */
export async function undoPartCheckIn(db, { ticketId, ticketSlug, partSlug }) {
	const res = await db
		.prepare(
			`DELETE FROM ticket_part_checkins WHERE ticket_id = ?1 AND part_slug = ?3
			AND ticket_id IN (SELECT id FROM tickets WHERE event_slug = ?2)`
		)
		.bind(ticketId, ticketSlug, partSlug)
		.run();
	return res.meta.changes === 1;
}

/**
 * Entradas válidas del taller e ingresadas a la parte, en total y por tipo (la forma de
 * `doorCounts`).
 *
 * @param {D1Database} db
 * @param {string} ticketSlug
 * @param {string} partSlug
 */
export async function partDoorCounts(db, ticketSlug, partSlug) {
	const { results } = await db
		.prepare(
			`SELECT t.ticket_type, COUNT(*) AS total, COUNT(p.ticket_id) AS inside FROM tickets t
			JOIN orders o ON o.id = t.order_id
			LEFT JOIN ticket_part_checkins p ON p.ticket_id = t.id AND p.part_slug = ?2
			WHERE t.event_slug = ?1 AND o.status = 'approved'
			GROUP BY t.ticket_type`
		)
		.bind(ticketSlug, partSlug)
		.all();
	/** @type {Record<string, { total: number, inside: number }>} */
	const byType = {};
	let total = 0;
	let inside = 0;
	for (const r of results) {
		const t = Number(r.total ?? 0);
		const i = Number(r.inside ?? 0);
		byType[String(r.ticket_type)] = { total: t, inside: i };
		total += t;
		inside += i;
	}
	return { total, inside, byType };
}

/**
 * Cambia el ingreso de cada fila por el de la parte (o ninguno): para la lista sin conexión, el
 * buscador y la compra completa, que leen el de `tickets`.
 *
 * @template {Record<string, any>} T
 * @param {D1Database} db
 * @param {string} partSlug
 * @param {T[]} rows
 * @param {{ id: string, at: string, by: string }} keys nombres de los campos en cada fila
 * @returns {Promise<T[]>}
 */
export async function overlayPartCheckins(db, partSlug, rows, keys) {
	if (!rows.length) return rows;
	/** @type {Map<string, { at: number, by: string }>} */
	const byTicket = new Map();
	const ids = [...new Set(rows.map((r) => String(r[keys.id])))];
	// D1 acepta hasta 100 parámetros por consulta.
	for (let i = 0; i < ids.length; i += 90) {
		const chunk = ids.slice(i, i + 90);
		const { results } = await db
			.prepare(
				`SELECT ticket_id, checked_in_at, checked_in_by FROM ticket_part_checkins
				WHERE part_slug = ? AND ticket_id IN (${chunk.map(() => '?').join(', ')})`
			)
			.bind(partSlug, ...chunk)
			.all();
		for (const r of results) {
			byTicket.set(String(r.ticket_id), {
				at: Number(r.checked_in_at),
				by: String(r.checked_in_by)
			});
		}
	}
	return rows.map((r) => {
		const p = byTicket.get(String(r[keys.id]));
		return { ...r, [keys.at]: p?.at ?? null, [keys.by]: p?.by ?? null };
	});
}

/**
 * Los ingresos a una parte marcados sin conexión (la forma y las reglas de
 * `applyQueuedCheckIns` de door.js: `duplicate` si es el mismo ingreso, `conflict` si otre lo
 * marcó antes).
 *
 * @param {D1Database} db
 * @param {{
 *   ticketSlug: string, partSlug: string, by: string,
 *   items: import('./door.js').QueuedCheckIn[], now?: number,
 *   resolve: (raw: string) => Promise<string>
 * }} input
 * @returns {Promise<import('./door.js').SyncResult[]>}
 */
export async function applyQueuedPartCheckIns(
	db,
	{ ticketSlug, partSlug, by, items, now = Date.now(), resolve }
) {
	/** @type {import('./door.js').SyncResult[]} */
	const out = [];
	for (const item of items) {
		const at = Math.min(now, Math.max(now - QUEUE_MAX_AGE_MS, Math.round(item.at)));
		const token = await resolve(item.token ?? item.code ?? '');
		if (!isValidToken(token)) {
			out.push({ id: item.id, result: 'invalid' });
			continue;
		}
		const inserted = await insertPartCheckIn(db, { token, ticketSlug, partSlug, at, by }).first();
		const t = await ticketWithBuyer(db, { token });
		if (!t) {
			out.push({ id: item.id, result: 'invalid' });
			continue;
		}
		if (inserted) {
			out.push({ id: item.id, result: 'ok', holder: t.holder_name, at, by });
			continue;
		}
		const p = await partRow(db, t.id, partSlug);
		if (t.event_slug !== ticketSlug) out.push({ id: item.id, result: 'wrong-event' });
		else if (t.order_status !== 'approved')
			out.push({ id: item.id, result: 'void', holder: t.holder_name });
		else if (p && p.checked_in_at === at && p.checked_in_by === by)
			out.push({ id: item.id, result: 'duplicate', holder: t.holder_name, at, by });
		else
			out.push({
				id: item.id,
				result: 'conflict',
				holder: t.holder_name,
				at: p?.checked_in_at ?? null,
				by: p?.checked_in_by ?? null
			});
	}
	return out;
}

/**
 * Panel → Eventos por páginas: la página de entrada manda los próximos, los borradores y los de
 * los últimos `PAST_DAYS` días (no los ~500 eventos), y los anteriores, la búsqueda y el CSV salen
 * de acá a pedido (`/admin/eventos/lista.json`, `/admin/eventos/eventos.csv`). Las ventas se
 * consultan solo para los eventos que se mandan. Filtros, búsqueda y columnas: $lib/admin/eventList.js.
 */
import { logDBError } from '$lib/server/db';
import { listPanelEventsWithMeta } from './panel.js';
import { totalCapacity } from '$lib/admin/eventFormat.js';
import { GOAL_KEY, MP_FEE_SQL, parseSalesGoal, storedSalesGoal } from '$lib/utils/salesGoal.js';
import {
	FILTERS,
	OLDER_PAGE,
	PAST_DAYS,
	filterTests,
	inFilter,
	isUpcoming,
	matchesSearch,
	searchWords
} from '$lib/admin/eventList.js';

/** @typedef {import('$lib/admin/eventList.js').EventRow} EventRow */
/** @typedef {import('$lib/admin/eventList.js').FilterId} FilterId */
/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Todos los eventos del panel, del más nuevo al más viejo, sin las ventas (`sold`/`revenue`/
 * `mpFee`/`transfers` en 0: ver {@link withSales}).
 * @returns {Promise<EventRow[]>}
 */
export async function panelEventRows() {
	// Con su frontmatter, leído una sola vez para todos (no un pedido a la base por evento).
	const events = await listPanelEventsWithMeta();
	return events.map(({ event: e, meta }, i) => {
		/** @type {number | null} */
		let capacity = null;
		// Meta de venta (`meta_venta`, solo si vende entradas): '' = sin meta.
		let goal = '';
		if (e.sellsTickets) {
			goal = storedSalesGoal(parseSalesGoal(meta?.[GOAL_KEY]));
			/** @type {any[]} */
			const list = Array.isArray(meta?.tickets) ? meta.tickets : [];
			// Un tipo sin `capacity` no tiene límite: entonces el evento tampoco (null).
			capacity = totalCapacity(list.map((t) => t?.capacity));
		}
		return {
			slug: e.slug,
			title: e.title,
			start: e.start,
			end: e.end,
			status: e.status,
			locationName: e.locationName,
			location: e.location,
			place: e.place,
			unlisted: e.unlisted,
			unpublished: e.unpublished,
			online: e.online,
			thumb: e.thumb ?? '',
			sellsTickets: e.sellsTickets,
			capacity,
			goal,
			sold: 0,
			revenue: 0,
			mpFee: 0,
			transfers: 0,
			i
		};
	});
}

/**
 * Las filas con sus ventas (entradas vendidas, lo recaudado, la comisión de Mercado Pago de eso y
 * transferencias esperando confirmación, vigentes),
 * en UNA consulta y solo para esos eventos. Sin base de datos o con un error, en 0 (la lista se
 * ve igual, sin números).
 * @param {D1Database | null | undefined} db
 * @param {EventRow[]} rows
 * @param {number} now
 * @returns {Promise<EventRow[]>}
 */
export async function withSales(db, rows, now) {
	if (!db || !rows.length) return rows;
	/** @type {Map<string, { sold: number, revenue: number, mpFee: number, transfers: number }>} */
	const sales = new Map();
	try {
		// Las direcciones van como una lista JSON (un solo parámetro: D1 acepta pocos por consulta).
		const { results } = await db
			.prepare(
				`SELECT event_slug,
					SUM(CASE WHEN status = 'approved' THEN quantity ELSE 0 END) AS sold,
					SUM(CASE WHEN status = 'approved' THEN total ELSE 0 END) AS revenue,
					SUM(CASE WHEN status = 'approved' THEN ${MP_FEE_SQL} ELSE 0 END) AS mp_fee,
					SUM(CASE WHEN status = 'awaiting_transfer' AND expires_at > ?1 THEN 1 ELSE 0 END) AS transfers
				FROM orders WHERE event_slug IN (SELECT value FROM json_each(?2)) GROUP BY event_slug`
			)
			.bind(now, JSON.stringify(rows.map((r) => r.slug)))
			.all();
		for (const r of results) {
			sales.set(String(r.event_slug), {
				sold: Number(r.sold ?? 0),
				revenue: Number(r.revenue ?? 0),
				mpFee: Number(r.mp_fee ?? 0),
				transfers: Number(r.transfers ?? 0)
			});
		}
	} catch (error) {
		logDBError('lista de eventos del panel', error);
	}
	return rows.map((r) => ({
		...r,
		sold: sales.get(r.slug)?.sold ?? 0,
		revenue: sales.get(r.slug)?.revenue ?? 0,
		mpFee: sales.get(r.slug)?.mpFee ?? 0,
		transfers: sales.get(r.slug)?.transfers ?? 0
	}));
}

/**
 * Desde qué día (YYYY-MM-DD) manda los pasados la página de entrada.
 * @param {string} today
 */
export function pastSince(today) {
	const d = new Date(`${today}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() - PAST_DAYS);
	return d.toISOString().slice(0, 10);
}

/**
 * ¿Va en la página de entrada? Los próximos, los de los últimos `PAST_DAYS` días, los borradores
 * (así «Próximos», «Borradores» y «Sin imagen» están completos) y los que no tienen fecha.
 * @param {EventRow} e
 * @param {string} today
 * @param {string} since ver {@link pastSince}
 */
function inFirstPage(e, today, since) {
	if (!e.start || isUpcoming(e, today) || e.start.slice(0, 10) >= since) return true;
	return e.unlisted && !e.unpublished;
}

/**
 * Lo que manda la página de entrada: esos eventos (sin ventas todavía), cuántos hay en cada
 * filtro y en total (de todos, no solo de los que van), y cuántos anteriores quedan.
 * @param {EventRow[]} rows todos, de {@link panelEventRows}
 * @param {string} today
 */
export function firstPage(rows, today) {
	const since = pastSince(today);
	const tests = filterTests(today);
	const events = rows.filter((e) => inFirstPage(e, today, since));
	return {
		events,
		counts: /** @type {Record<FilterId, number>} */ (
			Object.fromEntries(FILTERS.map((f) => [f.id, rows.filter(tests[f.id]).length]))
		),
		total: rows.length,
		older: rows.length - events.length,
		since
	};
}

/**
 * Los eventos anteriores (los que no manda la página de entrada), de a `limit` desde `offset`,
 * del más nuevo al más viejo, y cuántos quedan después.
 * @param {EventRow[]} rows todos
 * @param {string} today
 * @param {{ offset?: number, limit?: number }} [opts]
 */
export function olderPage(rows, today, { offset = 0, limit = OLDER_PAGE } = {}) {
	const since = pastSince(today);
	const older = rows.filter((e) => !inFirstPage(e, today, since));
	const from = Math.max(0, Math.floor(offset) || 0);
	const events = older.slice(from, from + limit);
	return { events, remaining: Math.max(0, older.length - from - events.length) };
}

/**
 * Los eventos para una búsqueda (en todos, como en la página) o, sin palabras, los de un filtro,
 * en el orden en que se muestran. Para el CSV y la búsqueda en el servidor.
 * @param {EventRow[]} rows todos
 * @param {{ query?: string, filter: FilterId, today: string }} opts
 */
export function listedRows(rows, { query = '', filter, today }) {
	const words = searchWords(query);
	return words.length ? rows.filter((e) => matchesSearch(e, words)) : inFilter(rows, filter, today);
}

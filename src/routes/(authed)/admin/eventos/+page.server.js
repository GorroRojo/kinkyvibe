import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { bundleMeta, listPanelEvents } from '$lib/server/eventos/panel.js';
import { totalCapacity } from '$lib/admin/eventFormat.js';
import { seriesEnabled } from '$lib/server/flags.js';

/**
 * Ventas por evento en una sola consulta: entradas vendidas y transferencias esperando
 * confirmación (vigentes). Sin base de datos, vacío (la lista se ve igual, sin números).
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {number} now
 * @returns {Promise<Map<string, { sold: number, transfers: number }>>}
 */
async function salesByEvent(db, now) {
	const out = new Map();
	if (!db) return out;
	try {
		const { results } = await db
			.prepare(
				`SELECT event_slug,
					SUM(CASE WHEN status = 'approved' THEN quantity ELSE 0 END) AS sold,
					SUM(CASE WHEN status = 'awaiting_transfer' AND expires_at > ?1 THEN 1 ELSE 0 END) AS transfers
				FROM orders GROUP BY event_slug`
			)
			.bind(now)
			.all();
		for (const r of results) {
			out.set(String(r.event_slug), {
				sold: Number(r.sold ?? 0),
				transfers: Number(r.transfers ?? 0)
			});
		}
	} catch (error) {
		logDBError('lista de eventos del panel', error);
	}
	return out;
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const now = Date.now();
	const [events, sales] = await Promise.all([
		listPanelEvents(),
		salesByEvent(getDB(platform), now)
	]);
	const rows = await Promise.all(
		events.map(async (e) => {
			/** @type {number | null} */
			let capacity = null;
			if (e.sellsTickets) {
				const meta = await bundleMeta(e.slug);
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
				sold: sales.get(e.slug)?.sold ?? 0,
				transfers: sales.get(e.slug)?.transfers ?? 0
			};
		})
	);
	// Interruptor `series`: botón a Eventos → Series.
	return { events: rows, now, seriesOn: await seriesEnabled(platform) };
}

/**
 * Check-in: elegir el evento para abrir el modo puerta. Primero los de hoy, después los
 * próximos y al final los recientes (últimos 60 días), con cuántes entraron.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { toTime } from '$lib/server/tickets/config.js';
import { checkinGroup } from '$lib/server/tickets/door.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform }) {
	requireAdmin(locals, url);
	const now = Date.now();
	const db = getDB(platform);
	/** @type {Map<string, { total: number, inside: number }>} */
	const counts = new Map();
	if (db) {
		try {
			const { results } = await db
				.prepare(
					`SELECT t.event_slug, COUNT(*) AS total, COUNT(t.checked_in_at) AS inside FROM tickets t
					JOIN orders o ON o.id = t.order_id WHERE o.status = 'approved' GROUP BY t.event_slug`
				)
				.all();
			for (const r of results) {
				counts.set(String(r.event_slug), {
					total: Number(r.total ?? 0),
					inside: Number(r.inside ?? 0)
				});
			}
		} catch (error) {
			logDBError('conteos del check-in', error);
		}
	}
	/** @type {Record<'hoy' | 'proximos' | 'recientes', { slug: string, title: string, start: number, location: string, total: number, inside: number }[]>} */
	const groups = { hoy: [], proximos: [], recientes: [] };
	for (const { slug, config } of await listTicketedEvents()) {
		if (config.online) continue;
		const start = toTime(config.start);
		const group = checkinGroup(start, now);
		if (!group || start === null) continue;
		const c = counts.get(slug) ?? { total: 0, inside: 0 };
		groups[group].push({
			slug,
			title: config.title || slug,
			start,
			location: config.location_name || config.location || '',
			...c
		});
	}
	groups.hoy.sort((a, b) => a.start - b.start);
	groups.proximos.sort((a, b) => a.start - b.start);
	groups.recientes.sort((a, b) => b.start - a.start);
	return { groups, hasDb: Boolean(db) };
}

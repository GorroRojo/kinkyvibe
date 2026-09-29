import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { getCounts } from '$lib/server/tickets/orders.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	// El load de la página corre en paralelo con el del layout: chequeamos acá también.
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const events = await listTicketedEvents();
	const rows = [];
	for (const { slug, config } of events) {
		/** @type {Map<string, { sold: number, held: number, revenue: number }>} */
		let counts = new Map();
		if (db) {
			try {
				counts = await getCounts(db, slug);
			} catch (error) {
				logDBError('admin tickets counts', error);
			}
		}
		const types = config.types.map((t) => ({
			id: t.id,
			name: t.name,
			price: t.price,
			capacity: t.capacity,
			sold: counts.get(t.id)?.sold ?? 0,
			held: counts.get(t.id)?.held ?? 0,
			revenue: counts.get(t.id)?.revenue ?? 0
		}));
		rows.push({
			slug,
			title: config.title,
			start: config.start ?? null,
			status: config.status ?? null,
			types,
			revenue: types.reduce((s, t) => s + t.revenue, 0)
		});
	}
	return { events: rows, dbAvailable: Boolean(db) };
}

import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { getAllCounts, salesTotals, summarizeEvent } from '$lib/server/admin/sales.js';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import { ordersNeedingReview } from '$lib/server/tickets/orders.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders, fetch }) {
	// El load de la página corre en paralelo con el del layout: chequeamos acá también.
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const now = Date.now();
	// Las órdenes a revisar y los contadores no dependen del fondo: salen a la par con él.
	const [toReview, allCounts] = db
		? [ordersNeedingReview(db), getAllCounts(db, now)]
		: [Promise.resolve([]), Promise.resolve(new Map())];
	const settled = Promise.allSettled([toReview, allCounts]);
	const fondo = await resolveFondoPercent({ db, fetch });
	const events = await listTicketedEvents({ fondoPercent: fondo.percent });
	/** @type {Map<string, number>} */
	const review = new Map();
	/** @type {Awaited<ReturnType<typeof getAllCounts>>} */
	let counts = new Map();
	if (db) {
		// Como antes en fila: si fallan las órdenes a revisar, no hay contadores ni revisión.
		const [r, c] = await settled;
		if (r.status === 'rejected') logDBError('admin ventas', r.reason);
		else {
			for (const o of r.value) review.set(o.event_slug, (review.get(o.event_slug) ?? 0) + 1);
			if (c.status === 'rejected') logDBError('admin ventas', c.reason);
			else counts = c.value;
		}
	}
	const rows = events.map((e) =>
		summarizeEvent(e, counts.get(e.slug), { now, review: review.get(e.slug) ?? 0 })
	);
	// Próximos: el más cercano primero. Pasados: el más reciente primero (ya vienen así).
	const upcoming = rows.filter((e) => e.upcoming).reverse();
	const past = rows.filter((e) => !e.upcoming);
	return {
		upcoming,
		past,
		totals: { upcoming: salesTotals(upcoming), all: salesTotals(rows) },
		dbAvailable: Boolean(db)
	};
}

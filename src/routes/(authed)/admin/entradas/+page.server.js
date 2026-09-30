import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { listTicketedEvents } from '$lib/server/tickets/events.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import { getCounts, ordersNeedingReview } from '$lib/server/tickets/orders.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders, fetch }) {
	// El load de la página corre en paralelo con el del layout: chequeamos acá también.
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const fondo = await resolveFondoPercent({ db, fetch });
	const events = await listTicketedEvents({ fondoPercent: fondo.percent });
	/** @type {Map<string, number>} */
	const review = new Map();
	if (db) {
		try {
			for (const o of await ordersNeedingReview(db))
				review.set(o.event_slug, (review.get(o.event_slug) ?? 0) + 1);
		} catch (error) {
			logDBError('admin tickets review', error);
		}
	}
	const rows = [];
	for (const { slug, config } of events) {
		/** @type {Awaited<ReturnType<typeof getCounts>>} */
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
			gorra: t.gorra,
			capacity: t.capacity,
			sold: counts.get(t.id)?.sold ?? 0,
			held: counts.get(t.id)?.held ?? 0,
			fondo: t.fondo,
			revenue: counts.get(t.id)?.revenue ?? 0,
			fondoUsed: counts.get(t.id)?.fondo ?? 0,
			contribution: counts.get(t.id)?.contribution ?? 0
		}));
		rows.push({
			slug,
			title: config.title,
			start: config.start ?? null,
			status: config.status ?? null,
			types,
			// Solo los eventos con la etiqueta KinkyVibe usan el Fondo.
			fondoEnabled: config.fondoEnabled,
			// Órdenes marcadas para revisar a mano (ver /admin/entradas/<slug>).
			review: review.get(slug) ?? 0,
			revenue: types.reduce((s, t) => s + t.revenue, 0),
			fondoUsed: types.reduce((s, t) => s + t.fondoUsed, 0),
			contribution: types.reduce((s, t) => s + t.contribution, 0),
			// Neto del fondo: aportes − lo que cubrió (negativo = el fondo puso más de lo que entró).
			fondoNet: types.reduce((s, t) => s + t.contribution - t.fondoUsed, 0)
		});
	}
	return { events: rows, dbAvailable: Boolean(db) };
}

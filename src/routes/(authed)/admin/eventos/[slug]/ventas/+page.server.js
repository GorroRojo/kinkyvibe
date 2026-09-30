/**
 * Ficha del evento, pestaña Ventas: números, por tipo, por día, cómo pagaron, Fondo y códigos.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { totalCapacity } from '$lib/admin/eventFormat.js';
import { typeClosesAt } from '$lib/server/tickets/config.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import { getCounts, listOrders } from '$lib/server/tickets/orders.js';
import {
	codesUsed,
	fondoBreakdown,
	heldBreakdown,
	paymentSplit,
	salesPerDay
} from '$lib/server/tickets/stats.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, params, platform, setHeaders, fetch }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const fondo = await resolveFondoPercent({ db, fetch });
	const config = await getEventTickets(params.slug, { fondoPercent: fondo.percent });
	if (!config) error(404, 'Ese evento no vende entradas.');
	if (!db) error(503, 'No hay base de datos disponible.');
	const now = Date.now();
	const [orders, counts] = await Promise.all([
		listOrders(db, params.slug),
		getCounts(db, params.slug, now)
	]);
	const types = config.types.map((t) => {
		const c = counts.get(t.id);
		return {
			id: t.id,
			name: t.name,
			price: t.price,
			fondo: t.fondo,
			gorra: t.gorra,
			capacity: t.capacity,
			closesAt: typeClosesAt(config, t),
			sold: c?.sold ?? 0,
			held: c?.held ?? 0,
			revenue: c?.revenue ?? 0,
			fondoUsed: c?.fondo ?? 0,
			contribution: c?.contribution ?? 0
		};
	});
	// Sin cupo total si algún tipo no tiene cupo (`capacity: null`, sin límite).
	const capacity = totalCapacity(types.map((t) => t.capacity));
	const sold = types.reduce((s, t) => s + t.sold, 0);
	// Cierres de tipos (ej. la anticipada) dentro de los últimos 14 días: una línea en el gráfico.
	const closes = types
		.filter((t) => t.closesAt && t.closesAt !== config.closesAt && t.closesAt <= now)
		.map((t) => ({ name: t.name, at: /** @type {number} */ (t.closesAt) }));
	return {
		types,
		totals: {
			sold,
			capacity,
			revenue: types.reduce((s, t) => s + t.revenue, 0),
			held: heldBreakdown(orders, now)
		},
		perDay: salesPerDay(orders, { now }),
		closes,
		payments: paymentSplit(orders),
		fondo: fondoBreakdown(orders),
		fondoEnabled: config.fondoEnabled,
		fondoPercent: config.fondoPercent,
		codes: codesUsed(orders),
		now
	};
}

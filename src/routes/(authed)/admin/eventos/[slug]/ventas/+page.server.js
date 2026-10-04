/**
 * Ficha del evento, pestaña Ventas: números (y la meta de venta, si tiene), por tipo, por día,
 * cómo pagaron, Fondo y códigos.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { totalCapacity } from '$lib/admin/eventFormat.js';
import { buildSalesChart } from '$lib/admin/salesChart.js';
import { listEvents } from '$lib/server/eventos';
import { toTime, typeClosesAt } from '$lib/server/tickets/config.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { resolveFondoPercent } from '$lib/server/tickets/fondo.js';
import { getCounts, listOrders } from '$lib/server/tickets/orders.js';
import { previousEditionSales } from '$lib/server/tickets/salesHistory.js';
import { goalProgress } from '$lib/utils/salesGoal.js';
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
	const eventStart = toTime(config.start);
	const [orders, counts, previous] = await Promise.all([
		listOrders(db, params.slug),
		getCounts(db, params.slug, now),
		previousSales(db, params.slug, eventStart)
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
			contribution: c?.contribution ?? 0,
			mpFee: c?.mpFee ?? 0
		};
	});
	// Sin cupo total si algún tipo no tiene cupo (`capacity: null`, sin límite).
	const capacity = totalCapacity(types.map((t) => t.capacity));
	const sold = types.reduce((s, t) => s + t.sold, 0);
	// Cierres de tipos (ej. la anticipada) dentro de los últimos 14 días: una línea en el gráfico.
	const closes = types
		.filter((t) => t.closesAt && t.closesAt !== config.closesAt && t.closesAt <= now)
		.map((t) => ({ name: t.name, at: /** @type {number} */ (t.closesAt) }));
	const chart = buildSalesChart({
		orders,
		now,
		opensAt: config.opensAt,
		eventStart,
		capacity,
		// Todos los cierres propios de tipos (pasados y futuros): marcas verticales del termómetro.
		closes: types
			.filter((t) => t.closesAt && t.closesAt !== config.closesAt)
			.map((t) => ({ name: t.name, at: /** @type {number} */ (t.closesAt) })),
		previous
	});
	const revenue = types.reduce((s, t) => s + t.revenue, 0);
	// La comisión de Mercado Pago de lo cobrado: la meta en plata cuenta lo neto.
	const mpFee = types.reduce((s, t) => s + t.mpFee, 0);
	return {
		chart,
		types,
		totals: {
			sold,
			capacity,
			revenue,
			held: heldBreakdown(orders, now)
		},
		// Avance contra la meta de venta (`meta_venta`; la de plata, neta de la comisión de MP), o
		// null: entonces, contra el cupo.
		progress: goalProgress(config.goal, { sold, revenue, mpFee }),
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

/**
 * Ventas de la edición anterior de la serie (para comparar en el termómetro), o null. Si falla,
 * la página se ve igual, sin la comparación.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {number | null} start
 */
async function previousSales(db, slug, start) {
	if (start === null) return null;
	try {
		const events = (await listEvents()).map((e) => ({
			slug: e.slug,
			title: e.title,
			start: toTime(e.start)
		}));
		return await previousEditionSales(db, { slug, start, events });
	} catch (e) {
		logDBError('edición anterior para el termómetro de ventas', e);
		return null;
	}
}

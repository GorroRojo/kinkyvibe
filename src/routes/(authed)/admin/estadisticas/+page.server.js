/**
 * Estadísticas: ventas en el tiempo, por serie, medio de pago y fondo, asistencia, primera vez
 * y quiénes vuelven. Solo admins. Todo sale de las órdenes aprobadas (ver stats.js y, para los
 * gráficos, charts.js), con una sola consulta.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { loadEventInfo, loadPeopleOrders } from '$lib/server/admin/people.js';
import { computeStats } from '$lib/server/admin/stats.js';
import { computeCharts } from '$lib/server/admin/charts.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) return { dbAvailable: false, stats: null, charts: null };
	try {
		const orders = await loadPeopleOrders(db);
		const events = await loadEventInfo(orders);
		const stats = computeStats(orders, events);
		return { dbAvailable: true, stats, charts: computeCharts(orders, events, stats) };
	} catch (error) {
		logDBError('estadísticas', error);
		return { dbAvailable: false, stats: null, charts: null };
	}
}

/**
 * Estadísticas: ventas en el tiempo, por serie, medio de pago y fondo, asistencia, primera vez
 * y quiénes vuelven. Solo admins. Todo sale de las órdenes aprobadas (ver stats.js).
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { loadEventInfo, loadPeopleOrders } from '$lib/server/admin/people.js';
import { computeStats } from '$lib/server/admin/stats.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	if (!db) return { dbAvailable: false, stats: null };
	try {
		const orders = await loadPeopleOrders(db);
		const events = await loadEventInfo(orders);
		return { dbAvailable: true, stats: computeStats(orders, events) };
	} catch (error) {
		logDBError('estadísticas', error);
		return { dbAvailable: false, stats: null };
	}
}

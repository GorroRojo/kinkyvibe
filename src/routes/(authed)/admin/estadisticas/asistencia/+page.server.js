/**
 * Estadísticas → Asistencia: vendidas y entraron, primera vez y vuelven, vuelven a la misma serie,
 * vuelven por serie y asistencia por evento, de los eventos que empezaron en el período elegido
 * (`?periodo=`, por defecto 12 meses). Solo admins. Sale solo de las órdenes y sus check-ins;
 * nunca llama a Analytics Engine.
 *
 * Carga todas las órdenes (sin filtrar por fecha): «primera vez» y «ya habían venido» necesitan
 * la historia completa. El período filtra los eventos que se muestran.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { loadEventInfo, loadPeopleOrders } from '$lib/server/admin/people.js';
import { attendancePage } from '$lib/server/admin/statsPages.js';
import { SALES_DEFAULT_PERIOD, SALES_PERIODS, periodFromUrl } from '$lib/admin/statsPeriod.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const period = periodFromUrl(url, SALES_PERIODS, SALES_DEFAULT_PERIOD);
	const db = getDB(platform);
	if (!db) return { dbAvailable: false, period: period.id, attendance: null };
	try {
		const orders = await loadPeopleOrders(db);
		const events = await loadEventInfo(orders);
		return {
			dbAvailable: true,
			period: period.id,
			attendance: attendancePage(orders, events, { period, now: Date.now() })
		};
	} catch (error) {
		logDBError('estadísticas: asistencia', error);
		return { dbAvailable: false, period: period.id, attendance: null };
	}
}

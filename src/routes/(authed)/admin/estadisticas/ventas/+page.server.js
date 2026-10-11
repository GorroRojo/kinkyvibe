/**
 * Estadísticas → Ventas: ventas en el tiempo, por serie, medio de pago, opciones del fondo y
 * Fondo y finanzas, del período elegido (`?periodo=`, por defecto 12 meses) y, si se elige, de una
 * serie (`?serie=`). Solo admins. Sale solo de las órdenes (una consulta, filtrada por fecha en
 * SQL); nunca llama a Analytics Engine (eso es la pestaña Visitas al sitio).
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { loadEventInfo, loadPeopleOrders } from '$lib/server/admin/people.js';
import { salesPage } from '$lib/server/admin/statsPages.js';
import {
	SALES_DEFAULT_PERIOD,
	SALES_PERIODS,
	SERIE_PARAM,
	periodFromUrl,
	periodRange
} from '$lib/admin/statsPeriod.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const period = periodFromUrl(url, SALES_PERIODS, SALES_DEFAULT_PERIOD);
	const serie = (url.searchParams.get(SERIE_PARAM) ?? '').trim().slice(0, 100);
	const db = getDB(platform);
	if (!db) return { dbAvailable: false, period: period.id, serie, sales: null };
	try {
		const now = Date.now();
		// El período y el anterior (para comparar los números de arriba); con «todo», todas.
		const { prevFrom } = periodRange(period, now);
		const orders = await loadPeopleOrders(db, { since: prevFrom });
		const events = await loadEventInfo(orders);
		return {
			dbAvailable: true,
			period: period.id,
			serie,
			sales: salesPage(orders, events, { period, serie, now })
		};
	} catch (error) {
		logDBError('estadísticas: ventas', error);
		return { dbAvailable: false, period: period.id, serie, sales: null };
	}
}

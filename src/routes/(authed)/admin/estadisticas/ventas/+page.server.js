/**
 * Estadísticas → Ventas: ventas en el tiempo, por serie, medio de pago, opciones del fondo y
 * Fondo y finanzas, del período elegido (`?periodo=`, por defecto 12 meses) y, si se elige, de una
 * serie (`?serie=`). Solo admins. Sale solo de las órdenes (una consulta, filtrada por fecha en
 * SQL); nunca llama a Analytics Engine (eso es la pestaña Visitas al sitio). «Fondo y finanzas»
 * suma las suscripciones del mes (fondo.kinkyvibe.ar, `fondoMonth.js`) y las propinas de esos
 * mismos meses; si alguna de las dos falla, esa parte queda vacía y lo demás anda.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { loadEventInfo, loadPeopleOrders } from '$lib/server/admin/people.js';
import { salesPage } from '$lib/server/admin/statsPages.js';
import { tipsByMonth } from '$lib/server/admin/charts.js';
import { tipsByMonthDestination } from '$lib/server/propinas/index.js';
import { resolveFondoMonth } from '$lib/server/tickets/fondoMonth.js';
import { arMidnight } from '$lib/utils/dates.js';
import {
	SALES_DEFAULT_PERIOD,
	SALES_PERIODS,
	SERIE_PARAM,
	periodFromUrl,
	periodRange
} from '$lib/admin/statsPeriod.js';

/**
 * Las propinas de Mercado Pago de los meses dados, por destino; `null` si no se pueden leer (sin
 * la tabla todavía): no tumba el resto de la página.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string[]} months "2026-09", de la más vieja a la más nueva
 */
async function loadTips(db, months) {
	if (!months.length) return null;
	try {
		const [y, m] = months[0].split('-').map(Number);
		return tipsByMonth(await tipsByMonthDestination(db, arMidnight(y, m - 1, 1)), months);
	} catch (error) {
		logDBError('estadísticas: propinas', error);
		return null;
	}
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const period = periodFromUrl(url, SALES_PERIODS, SALES_DEFAULT_PERIOD);
	const serie = (url.searchParams.get(SERIE_PARAM) ?? '').trim().slice(0, 100);
	const db = getDB(platform);
	if (!db)
		return {
			dbAvailable: false,
			period: period.id,
			serie,
			sales: null,
			fondoMonth: null,
			tips: null
		};
	try {
		const now = Date.now();
		// El período y el anterior (para comparar los números de arriba); con «todo», todas.
		const { prevFrom } = periodRange(period, now);
		const orders = await loadPeopleOrders(db, { since: prevFrom });
		const events = await loadEventInfo(orders);
		const sales = salesPage(orders, events, { period, serie, now });
		const [fondoMonth, tips] = await Promise.all([
			resolveFondoMonth({ db, fetch, now }),
			loadTips(
				db,
				sales.fondo.rows.map((r) => r.month)
			)
		]);
		return {
			dbAvailable: true,
			period: period.id,
			serie,
			sales,
			fondoMonth,
			tips
		};
	} catch (error) {
		logDBError('estadísticas: ventas', error);
		return {
			dbAvailable: false,
			period: period.id,
			serie,
			sales: null,
			fondoMonth: null,
			tips: null
		};
	}
}

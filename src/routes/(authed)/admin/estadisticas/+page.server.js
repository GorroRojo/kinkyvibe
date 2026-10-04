/**
 * Estadísticas: ventas en el tiempo, por serie, medio de pago y fondo, asistencia, primera vez
 * y quiénes vuelven. Solo admins. Todo sale de las órdenes aprobadas (ver stats.js y, para los
 * gráficos, charts.js), con una sola consulta.
 *
 * Además, las visitas anónimas del sitio (Analytics Engine + resumen mensual en D1, ver
 * $lib/server/analytics/report.js y docs/analiticas.md). Sin CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN,
 * el panel muestra qué falta configurar.
 */
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { loadEventInfo, loadPeopleOrders } from '$lib/server/admin/people.js';
import { computeStats } from '$lib/server/admin/stats.js';
import { computeCharts } from '$lib/server/admin/charts.js';
import { loadVisits } from '$lib/server/analytics/report.js';
import { getEventInfo } from '$lib/server/tickets/events.js';

/** @param {string[]} slugs */
async function eventTitles(slugs) {
	const infos = await Promise.all(slugs.map((s) => getEventInfo(s).catch(() => null)));
	return new Map(slugs.map((s, i) => [s, infos[i]?.title ?? s]));
}

/**
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {typeof fetch} fetchFn
 */
function visitsFor(db, fetchFn) {
	return loadVisits({
		env: { CF_ACCOUNT_ID: env.CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN: env.CF_ANALYTICS_TOKEN },
		db,
		fetch: fetchFn,
		titleOf: eventTitles
	});
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	// El fetch global (no el de SvelteKit): la API de Cloudflare es externa.
	const visits = visitsFor(db, globalThis.fetch);
	if (!db) return { dbAvailable: false, stats: null, charts: null, visits: await visits };
	try {
		const orders = await loadPeopleOrders(db);
		const events = await loadEventInfo(orders);
		const stats = computeStats(orders, events);
		return {
			dbAvailable: true,
			stats,
			charts: computeCharts(orders, events, stats),
			visits: await visits
		};
	} catch (error) {
		logDBError('estadísticas', error);
		return { dbAvailable: false, stats: null, charts: null, visits: await visits };
	}
}

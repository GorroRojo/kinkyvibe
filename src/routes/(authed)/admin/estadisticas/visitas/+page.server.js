/**
 * Estadísticas → Visitas al sitio: las visitas anónimas (Analytics Engine + resumen mensual en
 * D1, ver $lib/server/analytics/report.js y docs/analiticas.md) del período elegido
 * (`?periodo=`, 7, 30 o 90 días; por defecto 30). Solo admins. Nunca lee las órdenes: de D1 solo
 * sale `analytics_monthly`. Sin CF_ACCOUNT_ID / CF_ANALYTICS_TOKEN, la página muestra qué falta
 * configurar.
 */
import { env } from '$env/dynamic/private';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { loadVisits } from '$lib/server/analytics/report.js';
import { getEventInfo } from '$lib/server/tickets/events.js';
import { VISITS_DEFAULT_PERIOD, VISITS_PERIODS, periodFromUrl } from '$lib/admin/statsPeriod.js';

/** @param {string[]} slugs */
async function eventTitles(slugs) {
	const infos = await Promise.all(slugs.map((s) => getEventInfo(s).catch(() => null)));
	return new Map(slugs.map((s, i) => [s, infos[i]?.title ?? s]));
}

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const period = periodFromUrl(url, VISITS_PERIODS, VISITS_DEFAULT_PERIOD);
	const visits = await loadVisits({
		env: { CF_ACCOUNT_ID: env.CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN: env.CF_ANALYTICS_TOKEN },
		db: getDB(platform),
		// El fetch global (no el de SvelteKit): la API de Cloudflare es externa.
		fetch: globalThis.fetch,
		titleOf: eventTitles,
		days: period.days
	});
	return { period: period.id, visits };
}

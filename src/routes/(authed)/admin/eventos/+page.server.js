import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { firstPage, panelEventRows, withSales } from '$lib/server/eventos/panelList.js';
import { seriesEnabled } from '$lib/server/flags.js';
import { todayInArgentina } from '$lib/utils/eventDraft.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const now = Date.now();
	// Los próximos, los borradores y los de los últimos meses (no todos): los anteriores y la
	// búsqueda se piden a /admin/eventos/lista.json, el CSV completo a /admin/eventos/eventos.csv.
	const page = firstPage(await panelEventRows(), todayInArgentina(new Date(now)));
	const [events, seriesOn] = await Promise.all([
		// Las ventas, solo de los eventos que se mandan.
		withSales(getDB(platform), page.events, now),
		// Interruptor `series`: botón a Eventos → Series.
		seriesEnabled(platform)
	]);
	return {
		events,
		counts: page.counts,
		total: page.total,
		older: page.older,
		since: page.since,
		now,
		seriesOn
	};
}

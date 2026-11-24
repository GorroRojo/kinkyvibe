import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { firstPage, panelEventRows, withSales } from '$lib/server/eventos/panelList.js';
import { todayInArgentina } from '$lib/utils/eventDraft.js';
import { profitsEnabled } from '$lib/server/tickets/ganancia.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const now = Date.now();
	// Los próximos, los borradores y los de los últimos meses (no todos): los anteriores y la
	// búsqueda se piden a /admin/eventos/lista.json, el CSV completo a /admin/eventos/eventos.csv.
	const db = getDB(platform);
	const [rows, profits] = await Promise.all([panelEventRows(db), profitsEnabled(platform)]);
	const page = firstPage(rows, todayInArgentina(new Date(now)));
	// Las ventas (y la ganancia, con Gastos y reparto), solo de los eventos que se mandan.
	const events = await withSales(db, page.events, now, { profits });
	return {
		events,
		counts: page.counts,
		total: page.total,
		older: page.older,
		since: page.since,
		now
	};
}

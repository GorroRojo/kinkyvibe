/**
 * Panel → Eventos en CSV: TODOS los eventos del filtro (`?filtro=`) o de la búsqueda (`?q=`), en
 * el orden de la lista, aunque la página no los tenga cargados (va por páginas). Mismas columnas
 * que antes ($lib/admin/eventList.js). Solo admins: los layouts no protegen los `+server.js`.
 */
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { listedRows, panelEventRows, withSales } from '$lib/server/eventos/panelList.js';
import { CSV_COLUMNS, filterId } from '$lib/admin/eventList.js';
import { csvResponse, toCsv } from '$lib/admin/csv.js';
import { todayInArgentina } from '$lib/utils/eventDraft.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const now = Date.now();
	const filter = filterId(url.searchParams.get('filtro'));
	const rows = listedRows(await panelEventRows(), {
		query: (url.searchParams.get('q') ?? '').slice(0, 200),
		filter,
		today: todayInArgentina(new Date(now))
	});
	const events = await withSales(getDB(platform), rows, now);
	return csvResponse(toCsv(events, CSV_COLUMNS), `eventos-${filter}.csv`);
}

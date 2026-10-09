/**
 * Panel → Eventos, a pedido de la página (que no recibe todos los eventos, ver
 * $lib/server/eventos/panelList.js):
 * - `?q=texto`: los eventos que coinciden con la búsqueda, entre TODOS (también los anteriores);
 * - `?anteriores=N`: la tanda siguiente de eventos anteriores, salteando los N que ya tiene.
 * Con sus ventas. Solo admins: los layouts no protegen los endpoints `+server.js`.
 */
import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { listedRows, olderPage, panelEventRows, withSales } from '$lib/server/eventos/panelList.js';
import { todayInArgentina } from '$lib/utils/eventDraft.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const now = Date.now();
	const today = todayInArgentina(new Date(now));
	const q = url.searchParams.get('q');
	const offset = url.searchParams.get('anteriores');
	if (q === null && offset === null) error(400, 'Falta `q` o `anteriores`.');
	const db = getDB(platform);
	// Con la base, como la página: así «Ver anteriores» no repite ni pierde ninguno.
	const rows = await panelEventRows(db);
	const page =
		q !== null
			? {
					events: listedRows(rows, { query: q.slice(0, 200), filter: 'proximos', today }),
					remaining: 0
				}
			: olderPage(rows, today, { offset: Number(offset) });
	const events = await withSales(db, page.events, now);
	return json(
		{ events, remaining: page.remaining },
		{ headers: { 'cache-control': 'private, no-store' } }
	);
}

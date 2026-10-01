/**
 * CSV de Eventos → Series: una fila por edición de cada serie (o de una sola con ?serie=). Solo
 * admins; con el interruptor `series` apagado, 404. Sin datos de personas.
 */
import { requireAdmin } from '$lib/server/auth';
import { csvFilename, csvResponse, toCsv } from '$lib/admin/csv.js';
import { allSeries } from '$lib/server/series/index.js';
import { requireSeries } from '$lib/server/series/web.js';
import { argDate, argTime } from '$lib/utils/dates.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	await requireSeries(platform);
	const only = url.searchParams.get('serie');
	const now = Date.now();
	const rows = (await allSeries({ now }))
		.filter((s) => !only || s.id === only)
		.flatMap((s) => s.editions.map((e) => ({ series: s.name, ...e })));
	const csv = toCsv(rows, [
		{ label: 'Serie', key: 'series' },
		{ label: 'Edición', key: 'number' },
		{ label: 'Título', key: 'title' },
		{ label: 'Fecha (Argentina)', value: (r) => argDate(r.start) },
		{ label: 'Hora', value: (r) => argTime(r.start) },
		{ label: 'Estado', key: 'status' },
		{ label: 'Próxima', value: (r) => new Date(r.start).getTime() > now },
		{ label: 'Dirección', value: (r) => r.path }
	]);
	return csvResponse(csv, csvFilename('series', only, 'ediciones'));
}

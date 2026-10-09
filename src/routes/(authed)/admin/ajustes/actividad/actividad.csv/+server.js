import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { parseAuditFilters, queryAudit } from '$lib/server/admin/activity.js';
import { csvFilename, csvResponse, toCsv } from '$lib/admin/csv.js';

/** Tope de filas del CSV (el registro crece de a pocas filas por día). */
const MAX_ROWS = 10000;
const PAGE = 500;

/** CSV del registro de actividad con los mismos filtros que la página. */
/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	const filters = parseAuditFilters(url.searchParams);
	/** @type {import('$lib/server/admin/audit.js').AuditEntry[]} */
	const rows = [];
	let before = filters.before;
	while (rows.length < MAX_ROWS) {
		const page = await queryAudit(db, { ...filters, before, limit: PAGE });
		rows.push(...page);
		if (page.length < PAGE) break;
		before = page[page.length - 1].id;
	}
	const csv = toCsv(rows, [
		{ label: 'Fecha (hora de Argentina)', value: (r) => new Date(r.at) },
		{ label: 'Admin', key: 'actorLogin' },
		{ label: 'Acción', key: 'action' },
		{ label: 'Tipo de objeto', key: 'targetType' },
		{ label: 'Objeto', key: 'targetId' },
		{ label: 'Resumen', key: 'summary' },
		{ label: 'Detalle', value: (r) => (r.detail ? JSON.stringify(r.detail) : '') }
	]);
	return csvResponse(csv, csvFilename('actividad', filters.actor, filters.type));
}

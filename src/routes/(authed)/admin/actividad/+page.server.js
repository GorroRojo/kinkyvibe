import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import {
	ACTION_FAMILIES,
	TARGET_TYPES,
	auditFacets,
	auditFilterQuery,
	parseAuditFilters,
	queryAudit
} from '$lib/server/admin/activity.js';

const PAGE_SIZE = 50;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const filters = parseAuditFilters(url.searchParams);
	// Una de más para saber si hay otra página.
	const [rows, facets] = await Promise.all([
		queryAudit(db, { ...filters, limit: PAGE_SIZE + 1 }),
		auditFacets(db)
	]);
	const more = rows.length > PAGE_SIZE;
	const entries = rows.slice(0, PAGE_SIZE);
	const last = entries.at(-1);
	return {
		dbAvailable: Boolean(db),
		filters,
		entries,
		facets,
		families: ACTION_FAMILIES,
		targetTypes: TARGET_TYPES,
		nextHref: more && last ? auditFilterQuery(filters, { before: last.id }) || '?' : null,
		firstHref: filters.before ? auditFilterQuery({ ...filters, before: undefined }) || '?' : null,
		csvHref: `/admin/actividad/actividad.csv${auditFilterQuery({ ...filters, before: undefined })}`
	};
}

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
import { listRecoverable } from '$lib/server/admin/deletions.js';
import { undoAction } from '$lib/server/admin/deletionRoutes.js';

const PAGE_SIZE = 50;

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	const db = getDB(platform);
	const filters = parseAuditFilters(url.searchParams);
	// Una de más para saber si hay otra página.
	const [rows, facets, deletions] = await Promise.all([
		queryAudit(db, { ...filters, limit: PAGE_SIZE + 1 }),
		auditFacets(db),
		listRecoverable(db).catch(() => [])
	]);
	const more = rows.length > PAGE_SIZE;
	const entries = rows.slice(0, PAGE_SIZE);
	const last = entries.at(-1);
	return {
		dbAvailable: Boolean(db),
		filters,
		entries,
		facets,
		deletions,
		families: ACTION_FAMILIES,
		targetTypes: TARGET_TYPES,
		nextHref: more && last ? auditFilterQuery(filters, { before: last.id }) || '?' : null,
		firstHref: filters.before ? auditFilterQuery({ ...filters, before: undefined }) || '?' : null,
		csvHref: `/admin/ajustes/actividad/actividad.csv${auditFilterQuery({ ...filters, before: undefined })}`
	};
}

/** «Recuperar» un borrado del panel (ver src/lib/server/admin/deletions.js). */
/** @type {import('./$types').Actions} */
export const actions = { recuperar: undoAction };

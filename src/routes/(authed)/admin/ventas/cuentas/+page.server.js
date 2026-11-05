/**
 * Ventas › Cuentas del año (interruptor `gastos_reparto`; docs/tickets.md, «Gastos y reparto»):
 * el resumen por mes y el total del año, armado con las cuentas cerradas de cada evento
 * (`event_account_closings`, migración 0078). Solo admins; con el interruptor apagado, 404.
 */
import { error } from '@sveltejs/kit';
import { yearSummary } from '$lib/admin/reparto.js';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { gastosRepartoEnabled } from '$lib/server/flags.js';
import {
	MISSING_MIGRATION,
	accountsReady,
	closingYears,
	listClosings
} from '$lib/server/tickets/cuentas.js';
import { todayInArgentina } from '$lib/utils/eventDraft.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform, setHeaders }) {
	requireAdmin(locals, url);
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!(await gastosRepartoEnabled(platform))) error(404, 'No encontramos esta página.');
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const thisYear = Number(todayInArgentina().slice(0, 4));
	const asked = Number(url.searchParams.get('anio'));
	const year = Number.isInteger(asked) && asked > 2000 && asked < 3000 ? asked : thisYear;
	// Sin la migración 0078 (por ejemplo, una vista previa): la página avisa en vez de romperse.
	const ready = await accountsReady(db);
	const [rows, years] = ready
		? await Promise.all([listClosings(db, year), closingYears(db)])
		: [[], []];
	return {
		missingMigration: ready ? null : MISSING_MIGRATION,
		year,
		years: [...new Set([thisYear, year, ...years])].sort((a, b) => b - a),
		events: rows,
		...yearSummary(rows)
	};
}

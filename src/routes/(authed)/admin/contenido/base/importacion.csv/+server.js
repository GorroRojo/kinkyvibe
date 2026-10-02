import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { csvResponse, toCsv } from '$lib/admin/csv.js';
import { bundledSourceFiles } from '$lib/server/contenido/bundle.js';
import { planImport, publicRow } from '$lib/server/contenido/importer.js';
import { IMPORT_CSV } from '$lib/server/contenido/status.js';

/**
 * CSV de la importación de eventos: qué pasa con cada .md (sin escribir nada), qué campos
 * difieren, avisos y errores. Solo admins.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const plan = await planImport(db, 'calendario', await bundledSourceFiles('calendario'));
	return csvResponse(toCsv(plan.map(publicRow), IMPORT_CSV), 'eventos-en-la-base.csv');
}

import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { csvResponse, toCsv } from '$lib/admin/csv.js';
import { bundledSourceFiles } from '$lib/server/contenido/bundle.js';
import { planImport, publicRow } from '$lib/server/contenido/importer.js';
import { IMPORT_CATEGORIES, IMPORT_CSV } from '$lib/server/contenido/status.js';

/**
 * CSV de la importación de una categoría (`?categoria=calendario|material`): qué pasa con cada
 * .md (sin escribir nada), qué campos difieren, avisos y errores. Solo admins.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const asked = url.searchParams.get('categoria') ?? 'calendario';
	const category = IMPORT_CATEGORIES.find((c) => c.key === asked);
	if (!category) error(404, 'Not found');
	const plan = await planImport(db, category.key, await bundledSourceFiles(category.key));
	return csvResponse(toCsv(plan.map(publicRow), IMPORT_CSV), `${category.key}-en-la-base.csv`);
}

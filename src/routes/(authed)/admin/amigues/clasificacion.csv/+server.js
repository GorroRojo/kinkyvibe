import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { CLASSIFICATION_CSV, classificationRows } from '$lib/server/amigues/review.js';
import { csvResponse, toCsv } from '$lib/admin/csv.js';

/**
 * CSV de la lista de revisión de la clasificación de las fichas importadas (persona, grupo o
 * lugar, "a confirmar"). Solo admins.
 *
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	return csvResponse(
		toCsv(await classificationRows(db), CLASSIFICATION_CSV),
		'amigues-clasificacion.csv'
	);
}

/**
 * Todas las propinas en CSV (también las pendientes). Solo admins: los layouts no protegen los
 * endpoints `+server.js`, así que se chequea acá. Tiene los mensajes (privados): no compartirlo.
 */
import { error } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDB } from '$lib/server/db';
import { csvFilename, csvResponse, toCsv } from '$lib/admin/csv.js';
import { TIP_CSV_COLUMNS, listTips } from '$lib/server/propinas/index.js';

/** Tope de filas del CSV (holgado: una fila por propina). */
const CSV_MAX_ROWS = 20_000;

/** @type {import('./$types').RequestHandler} */
export async function GET({ locals, url, platform }) {
	requireAdmin(locals, url);
	const db = getDB(platform);
	if (!db) error(503, 'No hay base de datos disponible.');
	const tips = await listTips(db, { limit: CSV_MAX_ROWS, includePending: true });
	return csvResponse(toCsv(tips, TIP_CSV_COLUMNS), csvFilename('propinas'));
}

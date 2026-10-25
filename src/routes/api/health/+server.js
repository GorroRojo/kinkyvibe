/**
 * GET /api/health: si el sitio está sano, para un monitor externo o para mirar después de un
 * deploy. Público y sin datos: solo estados.
 *
 * - `db`: la base responde (`SELECT 1`). Sin base, o si falla: 503.
 * - `migrations`: si la base tiene aplicada la última migración del código (`__LATEST_MIGRATION__`,
 *   la fija vite.config.js al compilar). Se mira que esté, no que sea la última de la base: la base
 *   de producción puede ir adelantada (las migraciones se aplican antes del deploy).
 *   - `ok`: está.
 *   - `atrasada`: falta (el código espera una tabla o columna que la base no tiene): 503.
 *   - `sin registro`: la base no tiene `d1_migrations` (las bases locales y de los E2E se migran
 *     sin wrangler). No es un error.
 * - `sha`: el commit del build (Workers Builds); '' en local.
 *
 * Nunca dice qué migración falta: solo el estado.
 */
import { json } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';

export const prerender = false;

const HEADERS = { 'cache-control': 'no-store' };

/** @param {unknown} e */
const noSuchTable = (e) => /no such table/i.test(String(/** @type {any} */ (e)?.message ?? e));

/**
 * @param {import('@cloudflare/workers-types').D1Database | null} db
 * @param {string} latestMigration
 * @returns {Promise<'ok' | 'atrasada' | 'sin registro' | 'error'>} `error`: otra falla al leer
 *   `d1_migrations` (503).
 */
async function migrationStatus(db, latestMigration) {
	if (!db || !latestMigration) return 'sin registro';
	try {
		const row = /** @type {{ n?: number } | null} */ (
			await db
				.prepare('SELECT COUNT(*) AS n FROM d1_migrations WHERE name = ?')
				.bind(latestMigration)
				.first()
		);
		return Number(row?.n ?? 0) > 0 ? 'ok' : 'atrasada';
	} catch (e) {
		return noSuchTable(e) ? 'sin registro' : 'error';
	}
}

/** @type {import('./$types').RequestHandler} */
export async function GET({ platform }) {
	const db = getDB(platform);
	/** @type {'ok' | 'error' | 'sin base'} */
	let dbState = 'sin base';
	if (db) {
		try {
			await db.prepare('SELECT 1').first();
			dbState = 'ok';
		} catch {
			dbState = 'error';
		}
	}
	// Sin base que responda no hay migraciones que mirar: el mismo estado que `db`.
	const migrations = dbState === 'ok' ? await migrationStatus(db, __LATEST_MIGRATION__) : dbState;
	const ok = dbState === 'ok' && (migrations === 'ok' || migrations === 'sin registro');
	return json(
		{ ok, db: dbState, migrations, sha: __BUILD_SHA__ },
		{ status: ok ? 200 : 503, headers: HEADERS }
	);
}

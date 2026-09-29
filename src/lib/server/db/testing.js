/**
 * Utilidades para tests (solo Node/vitest, nunca se importa desde la app).
 *
 * `createTestDB()` levanta un D1 real de miniflare/workerd a través de `getPlatformProxy` de
 * wrangler, leyendo los mismos bindings de wrangler.toml que usa `npm run dev`, pero en memoria
 * (`persist: false`): cada llamada arranca con una base vacía y no toca `.wrangler/state`.
 * Después aplica todos los archivos de `migrations/` en orden, igual que
 * `wrangler d1 migrations apply`.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';

const MIGRATIONS_DIR = path.resolve('migrations');

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} [dir]
 */
export async function applyMigrations(db, dir = MIGRATIONS_DIR) {
	const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
	for (const file of files) {
		const sql = await readFile(path.join(dir, file), 'utf8');
		const statements = unstable_splitSqlQuery(sql).filter((s) => s.trim());
		if (statements.length) await db.batch(statements.map((s) => db.prepare(s)));
	}
	return files;
}

/**
 * @param {{ migrate?: boolean }} [options]
 */
export async function createTestDB({ migrate = true } = {}) {
	/** @type {import('wrangler').PlatformProxy<App.Platform['env']>} */
	const proxy = await getPlatformProxy({ persist: false, remoteBindings: false, envFiles: [] });
	const db = proxy.env.DB;
	if (!db) throw new Error('wrangler.toml no define el binding D1 `DB`');
	if (migrate) await applyMigrations(db);
	return {
		db,
		env: proxy.env,
		/** Plataforma con la forma de `event.platform` en SvelteKit. */
		platform: /** @type {App.Platform} */ ({ env: proxy.env }),
		dispose: () => proxy.dispose()
	};
}

/**
 * Borra todas las filas de las tablas de la app (para aislar tests dentro de un archivo).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
export async function resetDB(db) {
	const { results } = await db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations'"
		)
		.all();
	if (!results.length) return;
	// Los nombres vienen de sqlite_master, no del usuario; igual los citamos. D1 aplica las
	// foreign keys: diferirlas al final del batch permite borrar en cualquier orden.
	await db.batch([
		db.prepare('PRAGMA defer_foreign_keys = on'),
		...results.map((r) => db.prepare(`DELETE FROM "${String(r.name).replaceAll('"', '""')}"`))
	]);
}

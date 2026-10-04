// La base D1 LOCAL (la misma de `npm run dev`, en .wrangler/state), para los scripts que
// escriben con el código de la app (por ejemplo saveObject()). Nunca se conecta a Cloudflare:
// `remoteBindings: false`. Antes, aplica las migraciones locales que falten.
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { getPlatformProxy } from 'wrangler';

/**
 * @param {{ migrate?: boolean }} [opts] `migrate: false`: no aplica las migraciones (quien llama
 *   ya lo hizo, por ejemplo `predev`)
 * @returns {Promise<{ db: import('@cloudflare/workers-types').D1Database, dispose: () => Promise<void> }>}
 */
export async function openLocalD1({ migrate: applyMigrations = true } = {}) {
	if (applyMigrations) migrateLocal();
	/** @type {import('wrangler').PlatformProxy<{ DB?: import('@cloudflare/workers-types').D1Database }>} */
	const proxy = await getPlatformProxy({ persist: true, remoteBindings: false, envFiles: [] });
	const db = proxy.env.DB;
	if (!db) throw new Error('wrangler.toml no define el binding D1 `DB`');
	return { db, dispose: () => proxy.dispose() };
}

function migrateLocal() {
	const migrate = spawnSync(
		'npx',
		['wrangler', 'd1', 'migrations', 'apply', 'kinkyvibe', '--local'],
		{
			stdio: ['ignore', 'inherit', 'inherit'],
			env: { ...process.env, CI: 'true' },
			shell: process.platform === 'win32'
		}
	);
	if (migrate.status !== 0) throw new Error('No se pudieron aplicar las migraciones locales.');
}

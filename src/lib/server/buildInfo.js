/**
 * Datos del build que vite.config.js fija como constantes (`define`). Sin imports: se carga desde
 * vite.config.js, en Node, igual que ./deployBranch.js.
 */

/** Los archivos de migraciones de D1: `NNNN_nombre.sql` (migrations/, ver CLAUDE.md). */
const MIGRATION_FILE = /^\d{4}_[\w-]+\.sql$/;

/**
 * La última migración del código (el nombre del archivo, como lo guarda wrangler en
 * `d1_migrations.name`), o '' si no hay ninguna.
 *
 * @param {string[]} files los nombres de los archivos de migrations/
 * @returns {string}
 */
export function latestMigrationName(files) {
	const names = files.filter((f) => MIGRATION_FILE.test(f)).sort();
	return names.at(-1) ?? '';
}

/**
 * El commit que se está compilando. Workers Builds pone `WORKERS_CI_COMMIT_SHA` (en producción y
 * en los Previews):
 * https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#environment-variables
 * En local y en los tests no hay: ''.
 *
 * @param {Record<string, string | undefined>} env normalmente `process.env`
 * @returns {string}
 */
export function commitShaFromEnv(env) {
	const sha = (env.WORKERS_CI_COMMIT_SHA || '').trim();
	return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : '';
}

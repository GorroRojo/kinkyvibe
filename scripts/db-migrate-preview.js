// Aplica las migraciones pendientes a la base de los Previews (kinkyvibe-preview, la del bloque
// `[previews]` de wrangler.toml). `wrangler d1 migrations apply` solo encuentra las bases del
// nivel de arriba de la configuración, así que esto arma una configuración temporal con la base
// de previews (mismo id, sin copiarlo a mano) y la usa. Nunca toca la base de producción.
//
//   npm run db:migrate:preview
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { unstable_readConfig } from 'wrangler';

const config = unstable_readConfig({ config: 'wrangler.toml' });
const previewDb = /** @type {any} */ (config).previews?.d1_databases?.find(
	(/** @type {any} */ d) => d.binding === 'DB'
);
const productionIds = new Set(config.d1_databases.map((d) => d.database_id));
if (!previewDb?.database_id || productionIds.has(previewDb.database_id)) {
	console.error('wrangler.toml no tiene una base DB propia en [previews]: no hago nada.');
	process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), 'kinkyvibe-preview-db-'));
const tmpConfig = path.join(dir, 'wrangler.json');
writeFileSync(
	tmpConfig,
	JSON.stringify({
		name: 'kinkyvibe-preview-db',
		compatibility_date: config.compatibility_date,
		d1_databases: [
			{
				binding: 'DB',
				database_name: previewDb.database_name,
				database_id: previewDb.database_id,
				migrations_dir: path.resolve(previewDb.migrations_dir ?? 'migrations')
			}
		]
	})
);

console.log(`Migraciones → ${previewDb.database_name} (remota, solo Previews)`);
const result = spawnSync(
	'npx',
	['wrangler', 'd1', 'migrations', 'apply', previewDb.database_name, '--remote', '-c', tmpConfig],
	{ stdio: 'inherit', shell: process.platform === 'win32' }
);
process.exit(result.status ?? 1);

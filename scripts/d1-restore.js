// Restaura un backup de la base (src/lib/server/backup/) en una base D1 VACÍA y verifica que
// quedaron las mismas filas. Nunca pisa una base con datos: para volver producción atrás en los
// últimos 30 días está D1 Time Travel; para algo más viejo, se restaura en una base nueva y se
// cambia el binding. Ver docs/workers-migracion.md («Restaurar un backup»).
//
// Uso:
//   node scripts/d1-restore.js <origen> --local [--persist-to <carpeta>]
//       Simulacro en tu compu (no toca Cloudflare). Por defecto en .wrangler/restore, aparte de
//       la base de `npm run dev`.
//   node scripts/d1-restore.js <origen> --remote --to <base>
//       En una base de Cloudflare que tiene que estar vacía (crearla antes:
//       `npx wrangler d1 create kinkyvibe-restaurada`).
//
// <origen>: un archivo .sql.gz (o .sql) ya bajado, una fecha AAAA-MM-DD (el backup nocturno de
// ese día) o una clave del bucket (d1/manual/…). Lo que no es archivo se baja del bucket
// kinkyvibe-backups con `wrangler r2 object get --remote`.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const BUCKET = 'kinkyvibe-backups';
export const PRODUCTION_DB = 'kinkyvibe';
export const DEFAULT_LOCAL_DIR = '.wrangler/restore';
const STATS_COMMENT = '-- kinkyvibe-backup-stats';

/**
 * @param {string[]} argv
 * @returns {{ source: string, mode: 'local' | 'remote', to: string, persistTo: string }}
 */
export function parseArgs(argv) {
	/** @type {string[]} */
	const positional = [];
	let mode = /** @type {'local' | 'remote' | ''} */ ('');
	let to = '';
	let persistTo = DEFAULT_LOCAL_DIR;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--local' || arg === '--remote') {
			if (mode && mode !== arg.slice(2)) throw new Error('Elegí --local o --remote, no las dos.');
			mode = /** @type {'local' | 'remote'} */ (arg.slice(2));
		} else if (arg === '--to') to = argv[++i] ?? '';
		else if (arg === '--persist-to') persistTo = argv[++i] ?? '';
		else if (arg.startsWith('--')) throw new Error(`Opción desconocida: ${arg}`);
		else positional.push(arg);
	}
	if (positional.length !== 1)
		throw new Error('Falta el backup a restaurar (archivo, fecha o clave).');
	if (!mode) throw new Error('Falta --local (simulacro) o --remote --to <base>.');
	if (mode === 'remote') {
		if (!to) throw new Error('Con --remote hace falta --to <base vacía>.');
		if (to === PRODUCTION_DB) {
			throw new Error(
				`No se restaura encima de ${PRODUCTION_DB}. Restaurá en una base nueva, o usá D1 Time Travel (ver docs/workers-migracion.md).`
			);
		}
	}
	if (mode === 'local' && !persistTo) throw new Error('--persist-to necesita una carpeta.');
	return { source: positional[0], mode, to, persistTo };
}

/**
 * Qué es el origen: un archivo local o una clave del bucket.
 *
 * @param {string} source
 * @param {(p: string) => boolean} [exists]
 * @returns {{ kind: 'file', path: string } | { kind: 'r2', key: string }}
 */
export function resolveSource(source, exists = existsSync) {
	if (exists(source)) return { kind: 'file', path: source };
	if (/^\d{4}-\d{2}-\d{2}$/.test(source)) return { kind: 'r2', key: `d1/${source}.sql.gz` };
	if (/^d1\/[\w./-]+\.sql\.gz$/.test(source) && !source.includes('..')) {
		return { kind: 'r2', key: source };
	}
	throw new Error(
		`No encuentro «${source}»: ni es un archivo, ni una fecha AAAA-MM-DD, ni d1/….sql.gz`
	);
}

/**
 * Las cantidades de filas que anotó el backup al final.
 *
 * @param {string} sql
 * @returns {{ tables: number, rows: number, perTable: Record<string, number>, rebuilt?: string[], skipped?: string[] } | null}
 */
export function readStats(sql) {
	const line = sql
		.split('\n')
		.reverse()
		.find((l) => l.startsWith(STATS_COMMENT));
	if (!line) return null;
	return JSON.parse(line.slice(STATS_COMMENT.length));
}

/** @param {string} name */
const quoteIdent = (name) => `"${name.replaceAll('"', '""')}"`;

/**
 * @param {string[]} args
 * @param {{ json?: boolean }} [options]
 */
function wrangler(args, { json = false } = {}) {
	const result = spawnSync('npx', ['wrangler', ...args], {
		stdio: ['ignore', json ? 'pipe' : 'inherit', 'inherit'],
		encoding: 'utf8',
		env: { ...process.env, CI: 'true' },
		shell: process.platform === 'win32'
	});
	if (result.status !== 0) throw new Error(`Falló: wrangler ${args.join(' ')}`);
	if (!json) return null;
	const out = String(result.stdout);
	return JSON.parse(out.slice(out.indexOf('[')));
}

/**
 * @param {{ mode: 'local' | 'remote', to: string, persistTo: string }} target
 * @param {string} sql
 */
function query(target, sql) {
	const where =
		target.mode === 'remote'
			? [target.to, '--remote']
			: ['DB', '--local', '--persist-to', target.persistTo];
	const [first] = wrangler(['d1', 'execute', ...where, '--json', '--command', sql], { json: true });
	return /** @type {Record<string, unknown>[]} */ (first.results);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const source = resolveSource(options.source);
	const work = mkdtempSync(path.join(tmpdir(), 'kinkyvibe-restore-'));

	let gzPath = source.kind === 'file' ? source.path : path.join(work, 'backup.sql.gz');
	if (source.kind === 'r2') {
		console.log(`Bajando ${BUCKET}/${source.key}…`);
		wrangler(['r2', 'object', 'get', `${BUCKET}/${source.key}`, '--remote', '--file', gzPath]);
	}
	const raw = readFileSync(gzPath);
	const sql = gzPath.endsWith('.gz') ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
	const stats = readStats(sql);
	const sqlPath = path.join(work, 'backup.sql');
	writeFileSync(sqlPath, sql);
	console.log(`Backup: ${sql.split('\n', 1)[0].replace(/^--\s*/, '')}`);

	const where =
		options.mode === 'remote'
			? `la base ${options.to} (Cloudflare)`
			: `${options.persistTo} (local)`;
	const existing = query(
		options,
		"SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"
	);
	if (existing.length) {
		throw new Error(
			`${where} no está vacía (${existing.length} objetos). Restaurá en una base nueva${options.mode === 'local' ? ' o borrá esa carpeta' : ''}.`
		);
	}

	console.log(`Restaurando en ${where}…`);
	const target =
		options.mode === 'remote'
			? [options.to, '--remote']
			: ['DB', '--local', '--persist-to', options.persistTo];
	wrangler(['d1', 'execute', ...target, '--file', sqlPath, '--yes']);

	if (!stats) {
		console.warn('El backup no trae cantidades de filas para comparar: revisá a mano.');
		return;
	}
	let ok = true;
	for (const [table, expected] of Object.entries(stats.perTable)) {
		const [row] = query(options, `SELECT count(*) AS n FROM ${quoteIdent(table)}`);
		const got = Number(row?.n);
		const same = got === expected;
		if (!same) ok = false;
		console.log(`${same ? '✓' : '✗'} ${table}: ${got} filas (backup: ${expected})`);
	}
	for (const table of stats.rebuilt ?? []) {
		console.log(`↻ ${table}: índice de texto completo reconstruido desde su tabla de origen`);
	}
	for (const table of stats.skipped ?? []) {
		console.warn(`! ${table}: tabla virtual sin contenido propio, hay que volver a cargarla`);
	}
	if (!ok) throw new Error('La restauración no coincide con el backup.');
	console.log(`Listo: ${stats.tables} tablas, ${stats.rows} filas, igual que el backup.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	main().catch((error) => {
		console.error(`\n✗ ${error.message}`);
		process.exit(1);
	});
}

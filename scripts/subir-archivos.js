// Sube a la biblioteca (R2 + un objeto `archivo` en D1) los PDF, el video y el documento que
// todavía viven en src/lib/archivos, y reescribe los textos del material que los importan para que
// los nombren por su dirección de la biblioteca (src/lib/server/media/archivosViejos.js,
// docs/imagenes.md). Después de correrlo en producción, src/lib/archivos se puede borrar.
//
// Producción la corre gorrite (escribe en el R2 y la base de producción): sin --yes no escribe y,
// con --yes, pregunta antes. Idempotente: correrlo de nuevo no duplica nada.
//
//   node scripts/subir-archivos.js --dry                       # local: solo muestra qué haría
//   node scripts/subir-archivos.js                             # local (.wrangler/state)
//   node scripts/subir-archivos.js --target=preview --dry      # preview: solo muestra qué haría
//   node scripts/subir-archivos.js --target=preview --yes      # preview (necesita `wrangler login`)
//   node scripts/subir-archivos.js --target=production --dry   # producción: solo muestra qué haría
//   node scripts/subir-archivos.js --target=production --yes   # producción: pide escribir «produccion»
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { getPlatformProxy, unstable_readConfig } from 'wrangler';
import { ARCHIVOS_DIR, uploadRepoFiles } from '../src/lib/server/media/archivosViejos.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const target = (args.find((a) => a.startsWith('--target=')) ?? '--target=local').slice(9);
const ACTOR = 'script:subir-archivos';

/**
 * Los archivos de src/lib/archivos/<categoría>/<carpeta>/<archivo>.
 * @param {string} [root]
 * @returns {Promise<import('../src/lib/server/media/archivosViejos.js').RepoFile[]>}
 */
export async function repoFiles(root = process.cwd()) {
	/** @type {import('../src/lib/server/media/archivosViejos.js').RepoFile[]} */
	const out = [];
	const base = path.join(root, ARCHIVOS_DIR);
	for (const category of (await readdir(base).catch(() => [])).sort()) {
		for (const folder of (await readdir(path.join(base, category)).catch(() => [])).sort()) {
			for (const file of (
				await readdir(path.join(base, category, folder)).catch(() => [])
			).sort()) {
				const bytes = new Uint8Array(await readFile(path.join(base, category, folder, file)));
				out.push({ category, folder, file, bytes });
			}
		}
	}
	return out;
}

/** Lo que hay que escribir para confirmar que se escribe en producción. */
export const PRODUCTION_WORD = 'produccion';

/** Pide escribir {@link PRODUCTION_WORD} antes de tocar producción; si no, corta. */
async function confirmProduction() {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(
		`Vas a escribir en la base y el bucket de PRODUCCIÓN. Escribí «${PRODUCTION_WORD}» para seguir: `
	);
	rl.close();
	if (answer.trim().toLowerCase() !== PRODUCTION_WORD)
		throw new Error('Cancelado: no se escribió nada.');
}

/**
 * Las bindings DB y MEDIA de local (miniflare, .wrangler/state) o de preview o producción
 * (remotas).
 * @returns {Promise<{ db: any, bucket: any, dispose: () => Promise<void> }>}
 */
async function openTarget() {
	if (target === 'local') {
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
		const proxy = await getPlatformProxy({ persist: true, remoteBindings: false, envFiles: [] });
		return { db: proxy.env.DB, bucket: proxy.env.MEDIA, dispose: () => proxy.dispose() };
	}
	if (target === 'preview' || target === 'production') {
		const prod = target === 'production';
		if (!dryRun && !args.includes('--yes')) {
			throw new Error(
				prod
					? 'Esto escribe en la base y el bucket de PRODUCCIÓN. Probá primero con --dry; para escribir, agregá --yes.'
					: 'Esto escribe en la base y el bucket de PRUEBA (preview). Si es lo que querés, agregá --yes.'
			);
		}
		if (prod && !dryRun) await confirmProduction();
		// Las bindings tal cual están en wrangler.toml (las de arriba para producción, las de
		// [previews] para preview; los ids se leen del archivo, nunca se escriben a mano), marcadas
		// como remotas.
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		const section = prod ? config : /** @type {any} */ (config.previews ?? {});
		const d1 = (section.d1_databases ?? []).find((/** @type {any} */ b) => b.binding === 'DB');
		const r2 = (section.r2_buckets ?? []).find((/** @type {any} */ b) => b.binding === 'MEDIA');
		if (!d1 || !r2) {
			throw new Error(`wrangler.toml no tiene DB y MEDIA ${prod ? 'arriba' : 'en [previews]'}.`);
		}
		console.log(`${target}: base ${d1.database_name}, bucket ${r2.bucket_name}.`);
		const dir = await mkdtemp(path.join(tmpdir(), 'kv-archivos-'));
		const file = path.join(dir, 'wrangler.json');
		await writeFile(
			file,
			JSON.stringify({
				name: 'kinkyvibe-subir-archivos',
				compatibility_date: config.compatibility_date,
				d1_databases: [{ ...d1, remote: true }],
				r2_buckets: [{ ...r2, remote: true }]
			})
		);
		const proxy = await getPlatformProxy({ configPath: file, remoteBindings: true, envFiles: [] });
		return {
			db: proxy.env.DB,
			bucket: proxy.env.MEDIA,
			dispose: async () => {
				await proxy.dispose();
				await rm(dir, { recursive: true, force: true });
			}
		};
	}
	throw new Error(`--target tiene que ser local, preview o production (no «${target}»).`);
}

async function main() {
	const files = await repoFiles();
	const { db, bucket, dispose } = await openTarget();
	try {
		if (!db) throw new Error('No hay binding DB.');
		if (!bucket && !dryRun) throw new Error('No hay binding MEDIA (bucket de la biblioteca).');
		const s = await uploadRepoFiles(db, bucket, { files, actor: ACTOR, dryRun });
		const tag = dryRun ? '[vista previa] ' : '';
		console.log(`${tag}${target}: ${s.files} archivos en ${ARCHIVOS_DIR}.`);
		console.log(
			`${tag}archivos nuevos en la biblioteca: ${s.newFiles}, ya estaban: ${s.knownFiles}.`
		);
		for (const t of s.texts) {
			const extra = t.missing.length ? ` (sin archivo: ${t.missing.join(', ')})` : '';
			console.log(`${tag}material/${t.slug}: ${t.replaced.join(', ') || 'nada'}${extra}`);
		}
		for (const e of s.errors) console.log(`error ${e.what}: ${e.message}`);
		if (s.errors.length) process.exitCode = 1;
	} finally {
		await dispose();
	}
}

// pathToFileURL: en Windows la ruta trae `C:\` y barras invertidas, y `file://${…}` no coincide.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

// Importa UNA VEZ las imágenes que todavía están en el repo (src/lib/posts/*/media/** y
// src/lib/assets) a la biblioteca de imágenes: los archivos a R2 (binding MEDIA) y un objeto
// `imagen` por archivo en D1, más el edge de cada evento, material o serie que las usa (ver
// docs/imagenes.md y src/lib/server/media/import.js). Idempotente: correrlo de nuevo no duplica.
//
//   npm run images:import -- --dry                       # local: solo muestra qué haría
//   npm run images:import                                # local (.wrangler/state, como npm run dev)
//   npm run images:import -- --target=preview --dry      # preview: solo muestra qué haría
//   npm run images:import -- --target=preview --yes      # preview: escribe en la base y el bucket
//                                                        # de PRUEBA (necesita `wrangler login`)
//
// `--target=preview` usa las bindings de [previews] de wrangler.toml (la base kinkyvibe-preview y
// el bucket kinkyvibe-media-preview) con `remote = true`. Producción NO: no hay opción para eso a
// propósito (la corre gorrite cuando corresponda, con el mismo código, ver docs/imagenes.md).
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { getPlatformProxy, unstable_readConfig } from 'wrangler';
import {
	ASSETS_DIR,
	POSTS_MEDIA,
	importRepoImages,
	isImportablePath
} from '../src/lib/server/media/import.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const target = (args.find((a) => a.startsWith('--target=')) ?? '--target=local').slice(9);
const ACTOR = 'script:import-images';

/** Las rutas (relativas al repo) de las imágenes que se importan. */
export async function repoImagePaths(root = process.cwd()) {
	/** @type {string[]} */
	const out = [];
	/** @param {string} rel */
	async function walk(rel) {
		let entries;
		try {
			entries = await readdir(path.join(root, rel), { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const child = `${rel}/${e.name}`;
			if (e.isDirectory()) await walk(child);
			else if (isImportablePath(child)) out.push(child);
		}
	}
	for (const category of await readdir(path.join(root, POSTS_MEDIA)).catch(() => [])) {
		await walk(`${POSTS_MEDIA}/${category}/media`);
	}
	await walk(ASSETS_DIR);
	return out.sort();
}

/**
 * Las bindings DB y MEDIA de local (miniflare, .wrangler/state) o de preview (remotas).
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
	if (target === 'preview') {
		if (!dryRun && !args.includes('--yes')) {
			throw new Error(
				'Esto escribe en la base y el bucket de PRUEBA (preview). Si es lo que querés, agregá --yes.'
			);
		}
		// Las bindings de [previews] tal cual están en wrangler.toml (los ids se leen del archivo,
		// nunca se escriben a mano), marcadas como remotas.
		const config = unstable_readConfig({ config: 'wrangler.toml' });
		const previews = /** @type {any} */ (config).previews ?? {};
		const d1 = (previews.d1_databases ?? []).find((/** @type {any} */ b) => b.binding === 'DB');
		const r2 = (previews.r2_buckets ?? []).find((/** @type {any} */ b) => b.binding === 'MEDIA');
		if (!d1 || !r2) throw new Error('wrangler.toml no tiene DB y MEDIA en [previews].');
		const dir = await mkdtemp(path.join(tmpdir(), 'kv-images-'));
		const file = path.join(dir, 'wrangler.json');
		await writeFile(
			file,
			JSON.stringify({
				name: 'kinkyvibe-import-images',
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
	throw new Error(`--target tiene que ser local o preview (no «${target}»).`);
}

async function main() {
	const paths = await repoImagePaths();
	const files = await Promise.all(
		paths.map(async (p) => ({ path: p, bytes: new Uint8Array(await readFile(p)) }))
	);
	const { db, bucket, dispose } = await openTarget();
	try {
		if (!db) throw new Error('No hay binding DB.');
		if (!bucket && !dryRun) throw new Error('No hay binding MEDIA (bucket de imágenes).');
		const s = await importRepoImages(db, bucket, { files, actor: ACTOR, dryRun });
		const tag = dryRun ? '[vista previa] ' : '';
		console.log(`${tag}${target}: ${s.files} archivos del repo.`);
		console.log(`${tag}imágenes nuevas: ${s.newImages}, ya estaban: ${s.knownImages}.`);
		console.log(`${tag}usos a enlazar (eventos, material, series): ${s.links.length}.`);
		if (s.missing.length) {
			console.log(`${tag}campos que apuntan a un archivo que no está (quedan como están):`);
			for (const m of s.missing.slice(0, 50)) console.log(`  ${m.type}:${m.slug} → ${m.value}`);
		}
		for (const e of s.errors) console.log(`error ${e.path}: ${e.message}`);
		if (s.errors.length) process.exitCode = 1;
	} finally {
		await dispose();
	}
}

// pathToFileURL: en Windows la ruta trae `C:\` y barras invertidas, y `file://${…}` no coincide.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

// Carga un paquete de borradores de material (una carpeta con `manifest.json`, las portadas y las
// notas; NUNCA va al repo) como material NO LISTADO, por el mismo camino que guarda el panel
// (src/lib/server/contenido/importarMaterial.js, docs/contenido.md «Importar un paquete de
// borradores»). Solo los artículos con `importar: true`; solo la portada va a la biblioteca.
// Idempotente: una dirección que ya existe no se toca.
//
// Producción la corre gorrite (escribe en la base y el bucket de producción): sin --yes no
// escribe y, con --yes, pide escribir «produccion».
//
//   node scripts/importar-material.js --paquete=<carpeta> --dry                        # local, vista previa
//   node scripts/importar-material.js --paquete=<carpeta>                              # local (.wrangler/state)
//   node scripts/importar-material.js --paquete=<carpeta> --target=preview --yes       # preview (`wrangler login`)
//   node scripts/importar-material.js --paquete=<carpeta> --target=production --dry    # producción: qué haría
//   node scripts/importar-material.js --paquete=<carpeta> --target=production --yes    # pide escribir «produccion»
//
//   --fecha=original (por defecto): la fecha del post original (`fecha` del manifiesto o, si no
//   está, la línea «**Fuente:** <url> (AAAA-MM-DD, …)» de las notas); si no hay, la de hoy (y avisa).
//   --fecha=hoy: la fecha de hoy para todos.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { getPlatformProxy, unstable_readConfig } from 'wrangler';
import {
	DATE_MODES,
	IMPORT_ACTOR,
	importMaterialPackage,
	packagePath
} from '../src/lib/server/contenido/importarMaterial.js';

/** Lo que hay que escribir para confirmar que se escribe en producción. */
export const PRODUCTION_WORD = 'produccion';

/**
 * @param {string[]} argv
 * @returns {{ paquete: string, target: string, dryRun: boolean, yes: boolean, fecha: 'original' | 'hoy' }}
 */
export function parseArgs(argv) {
	/** @param {string} name */
	const value = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
	const paquete = value('paquete') ?? '';
	if (!paquete) throw new Error('Falta --paquete=<carpeta del paquete>.');
	const target = value('target') ?? 'local';
	if (!['local', 'preview', 'production'].includes(target))
		throw new Error(`--target tiene que ser local, preview o production (no «${target}»).`);
	const fecha = /** @type {'original' | 'hoy'} */ (value('fecha') ?? 'original');
	if (!DATE_MODES.includes(fecha))
		throw new Error(`--fecha tiene que ser original u hoy (no «${fecha}»).`);
	return { paquete, target, dryRun: argv.includes('--dry'), yes: argv.includes('--yes'), fecha };
}

/**
 * El paquete de una carpeta: los artículos del manifiesto y cómo leer sus archivos. Las rutas del
 * manifiesto pueden venir con `\` (Windows) o `/`; un zip de Windows descomprimido en Linux deja
 * archivos que se llaman `imagenes\<slug>\x.webp` (con las barras en el nombre): se prueban las dos
 * formas.
 *
 * @param {string} dir
 * @returns {Promise<import('../src/lib/server/contenido/importarMaterial.js').MaterialPackage>}
 */
export async function readPackageDir(dir) {
	const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
	if (!manifest || !Array.isArray(manifest.articulos))
		throw new Error('manifest.json no tiene la lista `articulos`.');
	return {
		articles: manifest.articulos,
		async readFile(relPath) {
			const clean = packagePath(relPath);
			if (!clean) return null;
			for (const candidate of [
				path.join(dir, ...clean.split('/')),
				path.join(dir, clean.replaceAll('/', '\\'))
			]) {
				try {
					return new Uint8Array(await readFile(candidate));
				} catch {
					// la otra forma
				}
			}
			return null;
		}
	};
}

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
 * @param {ReturnType<typeof parseArgs>} opts
 * @returns {Promise<{ db: any, bucket: any, dispose: () => Promise<void> }>}
 */
async function openTarget({ target, dryRun, yes }) {
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
	const prod = target === 'production';
	if (!dryRun && !yes) {
		throw new Error(
			prod
				? 'Esto escribe en la base y el bucket de PRODUCCIÓN. Probá primero con --dry; para escribir, agregá --yes.'
				: 'Esto escribe en la base y el bucket de PRUEBA (preview). Si es lo que querés, agregá --yes.'
		);
	}
	if (prod && !dryRun) await confirmProduction();
	// Las bindings tal cual están en wrangler.toml (las de arriba para producción, las de
	// [previews] para preview; los ids se leen del archivo, nunca se escriben a mano), remotas.
	const config = unstable_readConfig({ config: 'wrangler.toml' });
	const section = prod ? config : /** @type {any} */ (config.previews ?? {});
	const d1 = (section.d1_databases ?? []).find((/** @type {any} */ b) => b.binding === 'DB');
	const r2 = (section.r2_buckets ?? []).find((/** @type {any} */ b) => b.binding === 'MEDIA');
	if (!d1 || !r2) {
		throw new Error(`wrangler.toml no tiene DB y MEDIA ${prod ? 'arriba' : 'en [previews]'}.`);
	}
	console.log(`${target}: base ${d1.database_name}, bucket ${r2.bucket_name}.`);
	const dir = await mkdtemp(path.join(tmpdir(), 'kv-importar-material-'));
	const file = path.join(dir, 'wrangler.json');
	await writeFile(
		file,
		JSON.stringify({
			name: 'kinkyvibe-importar-material',
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

/**
 * El resumen, para la terminal.
 * @param {import('../src/lib/server/contenido/importarMaterial.js').ImportSummary} s
 * @param {{ target: string, dryRun: boolean }} opts
 */
export function formatSummary(s, { target, dryRun }) {
	const tag = dryRun ? '[vista previa] ' : '';
	const lines = [
		`${tag}${target}: ${dryRun ? 'se crearían' : 'creados'} ${s.created.length}, salteados ${s.skipped.length}, con problemas ${s.problems.length}.`
	];
	if (s.created.length)
		lines.push('', dryRun ? 'Se crearían (no listados):' : 'Creados (no listados):');
	for (const c of s.created) {
		lines.push(
			`  material/${c.slug} · ${c.date}${c.portada ? ' · con portada' : ' · sin portada'}`
		);
		for (const n of c.notes) lines.push(`      ! ${n}`);
	}
	if (s.skipped.length) lines.push('', 'Salteados:');
	for (const k of s.skipped) lines.push(`  ${k.slug}: ${k.reason}`);
	if (s.problems.length) lines.push('', 'Con problemas (no se cargaron):');
	for (const p of s.problems) lines.push(`  ${p.slug}: ${p.message}`);
	return lines.join('\n');
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const pkg = await readPackageDir(path.resolve(opts.paquete));
	const { db, bucket, dispose } = await openTarget(opts);
	try {
		if (!db) throw new Error('No hay binding DB.');
		if (!bucket && !opts.dryRun) throw new Error('No hay binding MEDIA (bucket de la biblioteca).');
		const s = await importMaterialPackage(db, bucket, pkg, {
			fecha: opts.fecha,
			actor: IMPORT_ACTOR,
			dryRun: opts.dryRun
		});
		console.log(formatSummary(s, opts));
		if (s.problems.length) process.exitCode = 1;
	} finally {
		await dispose();
	}
}

// pathToFileURL: en Windows la ruta trae `C:\` y barras invertidas, y `file://${…}` no coincide.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

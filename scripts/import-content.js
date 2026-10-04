// Importa los eventos y el material (src/lib/posts/{calendario,material}/*.md) a la base D1 LOCAL
// (la de `npm run dev` y la de las pruebas E2E con `vite preview`). El sitio lee los eventos y el
// material solo de la base (docs/contenido.md): sin esto, una base local nueva no tiene ninguno.
// Si la base todavía no tiene etiquetas, también las importa (como `npm run tags:import`): el
// editor de etiquetas solo guarda en la base (docs/etiquetas.md).
// Idempotente: lo que no cambió no se toca y lo editado en el panel no se pisa (ver
// src/lib/server/contenido/importer.js). Nunca toca una base remota (scripts/local-d1.js).
//
//   npm run content:import            # importa
//   npm run content:import -- --dry   # solo muestra qué haría
//   node scripts/import-content.js --soft --no-migrate   # (predev, después de migrar) si falla,
//                                                        # avisa y sigue
//
// Para las bases remotas (preview y producción) NO se usa este script: se usa el panel
// (Contenido → En la base → Importar), que corre lo mismo dentro del Worker contra la base de ese
// entorno.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { compile } from 'mdsvex';
import {
	importedSources,
	planImport,
	runImport,
	summarizeImport
} from '../src/lib/server/contenido/importer.js';
import { sha256 } from '../src/lib/server/amigues/importer.js';
import { importTags, summarizeTagImport } from '../src/lib/server/etiquetas/importer.js';
import hardcodedTags from '../src/lib/utils/hardcodedTags.js';
import { openLocalD1 } from './local-d1.js';

const dryRun = process.argv.includes('--dry');
const soft = process.argv.includes('--soft');
const quiet = process.argv.includes('--quiet') || soft;
const migrate = !process.argv.includes('--no-migrate');
const ACTOR = 'script:import-content';
const CATEGORIES = ['calendario', 'material'];

/**
 * Los .md de una categoría como los pide la importación: el texto y la metadata que da mdsvex (la
 * misma que daba el build). Los que ya están importados sin cambios (mismo SHA-256) se saltean
 * sin compilarlos: la importación no haría nada con ellos.
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} category
 */
async function sourceFiles(db, category) {
	const dir = path.resolve('src/lib/posts', category);
	const names = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
	const known = new Set([...(await importedSources(db, category)).values()].map((s) => s.hash));
	const texts = await Promise.all(
		names.map(async (name) => ({ name, raw: await readFile(path.join(dir, name), 'utf8') }))
	);
	/** @type {typeof texts} */
	const changed = [];
	for (const t of texts) if (!known.has(await sha256(t.raw))) changed.push(t);
	return Promise.all(
		changed.map(async ({ name, raw }) => {
			/** @type {Record<string, any> | null} */
			let meta = null;
			try {
				const compiled = await compile(raw, { extensions: ['.md'] });
				meta = /** @type {any} */ (compiled?.data)?.fm ?? null;
			} catch {
				meta = null;
			}
			return { legacySlug: name.slice(0, -3), raw, meta };
		})
	);
}

/**
 * Las etiquetas (el archivo y los textos de la wiki), solo si la base todavía no tiene ninguna.
 * @param {import('@cloudflare/workers-types').D1Database} db
 */
async function seedTags(db) {
	const any = await db
		.prepare("SELECT 1 AS x FROM objects WHERE type = 'etiqueta' LIMIT 1")
		.first();
	if (any) return;
	const wikiDir = path.resolve('src/lib/posts/wiki');
	const names = (await readdir(wikiDir)).filter((f) => f.endsWith('.md')).sort();
	const wikiFiles = await Promise.all(
		names.map(async (name) => ({
			name: name.slice(0, -3),
			raw: await readFile(path.join(wikiDir, name), 'utf8')
		}))
	);
	const { results } = await importTags(
		db,
		{ rawTags: JSON.parse(JSON.stringify(hardcodedTags)), wikiFiles },
		{ actor: ACTOR, dryRun }
	);
	const s = summarizeTagImport(results);
	console.log(`etiquetas: ${s.created} nuevas, ${s.error} con error.`);
}

async function main() {
	const { db, dispose } = await openLocalD1({ migrate });
	let errors = 0;
	try {
		await seedTags(db);
		for (const category of CATEGORIES) {
			const files = await sourceFiles(db, category);
			if (dryRun) {
				const s = summarizeImport(await planImport(db, category, files));
				console.log(`[vista previa] ${category}: ${JSON.stringify(s)}`);
				continue;
			}
			/** @type {import('../src/lib/server/contenido/importer.js').ImportRow[]} */
			const all = [];
			for (;;) {
				const { results, remaining } = await runImport(db, category, files, {
					actor: ACTOR,
					limit: 200
				});
				all.push(...results);
				if (!remaining || !results.length) break;
			}
			const s = summarizeImport(all);
			errors += s.error;
			for (const r of all.filter((x) => x.action === 'error')) {
				console.log(`error ${category}/${r.legacySlug}: ${r.message ?? ''}`);
			}
			if (!quiet || s.created || s.updated || s.error) {
				console.log(
					`${category}: ${s.created} nuevos, ${s.updated} actualizados, ${s.error} con error.`
				);
			}
		}
	} finally {
		await dispose();
	}
	if (errors) process.exitCode = 1;
}

try {
	await main();
} catch (e) {
	if (!soft) throw e;
	console.warn(
		'\n⚠️  No se pudieron importar los eventos, el material y las etiquetas a la base local:\n' +
			`   ${String(e)}\n` +
			'   El sitio va a arrancar sin eventos ni material. Probá a mano con: npm run content:import\n'
	);
}
if (soft) process.exitCode = 0;

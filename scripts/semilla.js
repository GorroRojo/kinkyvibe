// Llena la base D1 LOCAL (la de `npm run dev` y la de las pruebas E2E con `vite preview`) con la
// semilla de contenido público (src/lib/server/semilla/): etiquetas y wiki, perfiles de amigues,
// material y eventos. El sitio lee todo eso solo de la base (docs/contenido.md): sin esto, una
// base local nueva no tiene nada. Idempotente: lo que ya está no se toca y lo editado en la base
// no se pisa. Nunca toca una base remota (scripts/local-d1.js).
//
//   npm run db:semilla                                # carga la semilla
//   node scripts/semilla.js --soft --no-migrate       # (predev, después de migrar) si falla,
//                                                     # avisa y sigue
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { loadSeed } from '../src/lib/server/semilla/index.js';
import { openLocalD1 } from './local-d1.js';

const soft = process.argv.includes('--soft');
const quiet = process.argv.includes('--quiet') || soft;
const migrate = !process.argv.includes('--no-migrate');
const DIR = path.resolve('src/lib/server/semilla');
const PARTS = ['etiquetas', 'wiki', 'amigues', 'calendario', 'material'];

/** La semilla, leída de los .json de src/lib/server/semilla. */
async function readSeed() {
	/** @type {Record<string, unknown>} */
	const seed = {};
	for (const part of PARTS) {
		seed[part] = JSON.parse(await readFile(path.join(DIR, `${part}.json`), 'utf8'));
	}
	return /** @type {import('../src/lib/server/semilla/index.js').Seed} */ (seed);
}

async function main() {
	const seed = await readSeed();
	const { db, dispose } = await openLocalD1({ migrate });
	try {
		const r = await loadSeed(db, seed, { actor: 'script:semilla' });
		for (const e of r.errors) console.log(`error ${e}`);
		for (const part of /** @type {const} */ (['etiquetas', 'amigues', 'calendario', 'material'])) {
			const s = r[part];
			if (!s) continue;
			const changed = s.created || ('updated' in s && s.updated) || s.error;
			if (!quiet || changed) {
				console.log(
					`${part}: ${s.created} nuevos${'updated' in s ? `, ${s.updated} actualizados` : ''}, ${s.error} con error.`
				);
			}
		}
		if (r.errors.length) process.exitCode = 1;
	} finally {
		await dispose();
	}
}

try {
	await main();
} catch (e) {
	if (!soft) throw e;
	console.warn(
		'\n⚠️  No se pudo cargar la semilla de contenido en la base local:\n' +
			`   ${String(e)}\n` +
			'   El sitio va a arrancar sin eventos, material, perfiles ni etiquetas. Probá a mano con:\n' +
			'   npm run db:semilla\n'
	);
}
if (soft) process.exitCode = 0;

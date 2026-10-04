#!/usr/bin/env node
/**
 * Guardas para que los datos de prueba del modo demo nunca lleguen a producción (docs/demo.md).
 * Las corre CI (.github/workflows/ci.yml) y las prueba src/lib/server/demo/demoGuard.test.js.
 *
 *   node scripts/demo/guard.js posts
 *     Falla si hay eventos de prueba entre los posts (`src/lib/posts/**`): los .md que escribe
 *     `node scripts/demo/seed.js --write-events` son solo para la rama `demo`. CI lo corre en los
 *     PR contra `main` y en `main`.
 *
 *   node scripts/demo/guard.js bundle <archivo>
 *     Falla si el Worker empaquetado (`wrangler deploy --dry-run`) trae el seed o el botón
 *     «Recargar datos de prueba». El build de CI no tiene rama de deploy, igual que el de
 *     producción para estos fines (`PREVIEW_BUILD` es `false`): esos módulos se eliminan.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_MARKER, SEED_BY } from '../../src/lib/server/demo/seed.js';
import { DEMO_SLOT_KEY } from '../../src/lib/server/demo/seedEvents.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const POSTS_DIR = path.join(ROOT, 'src/lib/posts');

/**
 * Textos que solo están en el seed (src/lib/server/demo/seed.js, seedProfiles.js, seedEvents.js) y en el botón
 * de recargar (DemoReload.svelte). Si alguno aparece en el bundle de producción, algo importó el
 * modo demo fuera de `if (PREVIEW_BUILD)`.
 */
export const SEED_BUNDLE_MARKERS = Object.freeze([
	SEED_BY,
	DEMO_SLOT_KEY,
	'refugio-demo-oculto',
	'demo.aviso.uno@example.invalid',
	'Recargar datos de prueba'
]);

/**
 * Los .md de `dir` (recursivo) que son eventos de prueba: llevan la marca del seed en el
 * frontmatter. Devuelve sus paths relativos a `dir`.
 *
 * @param {string} [dir]
 * @returns {string[]}
 */
export function findDemoPosts(dir = POSTS_DIR) {
	/** @type {string[]} */
	const found = [];
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
		const full = path.join(entry.parentPath, entry.name);
		if (readFileSync(full, 'utf8').includes(EVENT_MARKER)) found.push(path.relative(dir, full));
	}
	return found.sort();
}

/**
 * Las marcas del seed que aparecen en un bundle.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function seedMarkersIn(text) {
	return SEED_BUNDLE_MARKERS.filter((m) => text.includes(m));
}

function main() {
	const [cmd, file] = process.argv.slice(2);
	if (cmd === 'posts') {
		const found = findDemoPosts();
		if (found.length) {
			console.error(
				`Hay eventos de prueba del modo demo entre los posts (solo van en la rama demo):\n` +
					found.map((f) => `  src/lib/posts/${f}`).join('\n')
			);
			process.exit(1);
		}
		console.log('guard posts: sin eventos de prueba.');
		return;
	}
	if (cmd === 'bundle' && file) {
		const branch = (process.env.WORKERS_CI_BRANCH || process.env.CF_PAGES_BRANCH || '').trim();
		if (branch && branch !== 'main') {
			console.error(`guard bundle: este build es de la rama «${branch}» (preview); no sirve.`);
			process.exit(1);
		}
		const found = seedMarkersIn(readFileSync(file, 'utf8'));
		if (found.length) {
			console.error(
				`El bundle de producción trae el seed del modo demo (${found.join(', ')}). Tiene que ` +
					'importarse solo dentro de `if (PREVIEW_BUILD)` (docs/demo.md).'
			);
			process.exit(1);
		}
		console.log('guard bundle: sin datos de prueba.');
		return;
	}
	console.error('Uso: node scripts/demo/guard.js posts | bundle <archivo>');
	process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

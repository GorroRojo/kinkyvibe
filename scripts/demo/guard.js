#!/usr/bin/env node
/**
 * Guardas para que los datos de prueba del modo demo nunca lleguen a producción (docs/demo.md).
 * Las corre CI (.github/workflows/ci.yml) y las prueba src/lib/server/demo/demoGuard.test.js.
 *
 *   node scripts/demo/guard.js bundle <archivo>
 *     Falla si el Worker empaquetado (`wrangler deploy --dry-run`) trae el seed, el botón
 *     «Recargar datos de prueba», la galería de componentes (/estilo, docs/estilo.md) o el
 *     borrador de la página legal (/legales, docs/legales.md). El build
 *     de CI no tiene rama de deploy, igual que el de producción para estos fines
 *     (`PREVIEW_BUILD` es `false`): esos módulos se eliminan.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED_BY } from '../../src/lib/server/demo/seed.js';
import { DEMO_SLOT_KEY } from '../../src/lib/server/demo/seedEvents.js';
import { COPY_MARK_KEY } from '../../src/lib/server/demo/realEvents.js';
import { deployBranchFromEnv } from '../../src/lib/server/deployBranch.js';

/**
 * Textos que solo están en el seed (src/lib/server/demo/seed.js, seedProfiles.js, seedEvents.js,
 * realEvents.js) y en el botón
 * de recargar (DemoReload.svelte). Si alguno aparece en el bundle de producción, algo importó el
 * modo demo fuera de `if (PREVIEW_BUILD)`.
 */
export const SEED_BUNDLE_MARKERS = Object.freeze([
	SEED_BY,
	DEMO_SLOT_KEY,
	COPY_MARK_KEY,
	'refugio-demo-oculto',
	'demo.aviso.uno@example.invalid',
	'Recargar datos de prueba'
]);

/**
 * Marca de la galería de componentes (src/lib/estilo/Galeria.svelte, `data-kv-estilo`): solo
 * existe en previews y en dev (src/routes/estilo/+page.js). Si aparece en el bundle de
 * producción, la galería se coló.
 */
export const GALLERY_BUNDLE_MARKER = 'kv-estilo-galeria';

/**
 * La galería de componentes en un bundle.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function galleryIn(text) {
	return text.includes(GALLERY_BUNDLE_MARKER);
}

/**
 * Marca de los borradores legales (src/lib/legales/Legales.svelte, `data-kv-legales`): solo existen
 * en previews y en dev (src/routes/(content)/legales/+page.js) hasta que se publiquen
 * (docs/legales.md). Si aparece en el bundle de producción, los borradores se colaron.
 */
export const LEGALES_BUNDLE_MARKER = 'kv-legales-borrador';

/**
 * Los borradores legales en un bundle.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function legalesIn(text) {
	return text.includes(LEGALES_BUNDLE_MARKER);
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
	if (cmd === 'bundle' && file) {
		const branch = deployBranchFromEnv(process.env);
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
		if (galleryIn(readFileSync(file, 'utf8'))) {
			console.error(
				'El bundle de producción trae la galería de componentes (/estilo). Tiene que importarse ' +
					'solo dentro de la condición de src/routes/estilo/+page.js (docs/estilo.md).'
			);
			process.exit(1);
		}
		if (legalesIn(readFileSync(file, 'utf8'))) {
			console.error(
				'El bundle de producción trae el borrador de la página legal (/legales). Tiene ' +
					'que importarse solo dentro de la condición de ' +
					'src/routes/(content)/legales/+page.js (docs/legales.md).'
			);
			process.exit(1);
		}
		console.log('guard bundle: sin datos de prueba, galería de componentes ni borradores legales.');
		return;
	}
	console.error('Uso: node scripts/demo/guard.js bundle <archivo>');
	process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

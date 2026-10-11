/**
 * Guardas de los prototipos (/estilo/prototipos/*): como la galería /estilo (ver
 * src/lib/estilo/estiloGuard.test.js), solo existen en los deploys de preview y en `vite dev`. En
 * producción dan 404 y no entran en el bundle. Además lo controlan tests/smoke.spec.js (404 en un
 * build sin rama de deploy) y `node scripts/demo/guard.js bundle` (el marco lleva la marca).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GALLERY_BUNDLE_MARKER } from '../../../../scripts/demo/guard.js';
import { PROTOTIPOS } from './prototipos.js';

// Cargar un prototipo en dev compila su componente (y los íconos de Lucide) en frío: en una
// máquina cargada pasa los 5 s de siempre. Como los tests de la base, más margen; nada cambia lo
// que se controla.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const DIR = 'src/routes/estilo/prototipos';
const read = (/** @type {string} */ rel) => readFileSync(path.join(ROOT, rel), 'utf8');
// La misma condición de compilación que src/routes/estilo/+page.js.
const GATE =
	"if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {";

/** Cada página: el índice y un prototipo por carpeta, con el componente que importa. */
const PAGES = [
	{ dir: DIR, component: './Indice.svelte' },
	...PROTOTIPOS.map((p) => ({
		dir: `${DIR}/${p.slug}`,
		component: `./${read(`${DIR}/${p.slug}/+page.js`).match(/import\('\.\/([A-Za-z]+\.svelte)'\)/)?.[1]}`
	}))
];
/** @type {Record<string, () => Promise<any>>} */
const loaders = {
	[DIR]: () => import('./+page.js'),
	[`${DIR}/filtros-celu`]: () => import('./filtros-celu/+page.js'),
	[`${DIR}/filtros-celu-v2`]: () => import('./filtros-celu-v2/+page.js'),
	[`${DIR}/lista-de-espera`]: () => import('./lista-de-espera/+page.js')
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe('prototipos: solo en previews y en dev', () => {
	it('cada carpeta con página está en la lista (y al revés)', () => {
		const dirs = readdirSync(path.join(ROOT, DIR), { withFileTypes: true })
			.filter((e) => e.isDirectory() && existsSync(path.join(ROOT, DIR, e.name, '+page.js')))
			.map((e) => e.name)
			.sort();
		expect(dirs).toEqual(PROTOTIPOS.map((p) => p.slug).sort());
		expect(Object.keys(loaders).sort()).toEqual(PAGES.map((p) => p.dir).sort());
		// Ni +page.server.js ni +layout: nada que corra en el servidor ni que se arme siempre.
		for (const entry of readdirSync(path.join(ROOT, DIR), {
			recursive: true,
			withFileTypes: true
		})) {
			if (entry.isFile()) expect(entry.name).not.toMatch(/^\+(page\.server|layout|server)/);
		}
	});

	for (const { dir } of PAGES) {
		it(`${dir}: fuera de dev y sin rama de preview (como producción), da 404`, async () => {
			vi.stubEnv('DEV', false);
			vi.stubEnv('PROD', true);
			expect(__DEPLOY_BRANCH__).toBe('');
			const { load } = await loaders[dir]();
			await expect(load(/** @type {any} */ ({}))).rejects.toMatchObject({ status: 404 });
		});

		it(`${dir}: en dev, carga el prototipo`, async () => {
			vi.stubEnv('DEV', true);
			const { load } = await loaders[dir]();
			const data = /** @type {any} */ (await load(/** @type {any} */ ({})));
			expect(data?.Prototipo).toBeTypeOf('function');
		});
	}

	it('el prototipo se importa solo dentro de la condición de compilación', () => {
		for (const { dir, component } of PAGES) {
			const src = read(`${dir}/+page.js`);
			const staticImports = src.match(/^import\s[^;]*;/gms) ?? [];
			expect(staticImports, dir).toEqual(["import { error } from '@sveltejs/kit';"]);
			const gate = src.indexOf(GATE);
			expect(gate, dir).toBeGreaterThan(-1);
			const dynamic = src.indexOf(`import('${component}')`);
			expect(dynamic, dir).toBeGreaterThan(gate);
			expect(src.indexOf("error(404, 'Not found')"), dir).toBeGreaterThan(dynamic);
		}
	});

	it('nada fuera de /estilo/prototipos importa sus archivos', () => {
		/** @type {string[]} */
		const offenders = [];
		const dir = path.join(ROOT, 'src');
		for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !/\.(js|ts|svelte)$/.test(entry.name)) continue;
			const rel = path.relative(ROOT, path.join(entry.parentPath, entry.name));
			if (rel.startsWith(`${DIR}/`)) continue;
			if (
				/estilo\/prototipos\/[^'"]*\.(svelte|js)/.test(readFileSync(path.join(ROOT, rel), 'utf8'))
			)
				offenders.push(rel);
		}
		expect(offenders).toEqual([]);
	});

	it('todos los prototipos van dentro del marco, que lleva la marca del guard del bundle', () => {
		expect(read(`${DIR}/Marco.svelte`)).toContain(`'${GALLERY_BUNDLE_MARKER}'`);
		for (const { dir, component } of PAGES) {
			expect(read(path.join(dir, component)), dir).toMatch(
				/import Marco from '\.\.?\/Marco\.svelte'/
			);
		}
	});
});

describe('prototipos: versiones', () => {
	it('las dos versiones de «Filtros en el celu» se linkean entre sí (para comparar)', () => {
		expect(read(`${DIR}/filtros-celu/FiltrosCelu.svelte`)).toContain(
			'href="/estilo/prototipos/filtros-celu-v2"'
		);
		expect(read(`${DIR}/filtros-celu-v2/SegundaVersion.svelte`)).toContain(
			'href="/estilo/prototipos/filtros-celu"'
		);
	});
});

describe('prototipos: filtros versión 2', () => {
	it('«Ver como» con íconos: cada botón con su nombre y su estado elegido', () => {
		const src = read(`${DIR}/filtros-celu-v2/ListaV2.svelte`);
		expect(src).toContain('aria-label="Ver como lista"');
		expect(src).toContain('aria-label="Ver como grilla"');
		expect(src).toContain("aria-pressed={display === 'list'}");
		expect(src).toContain("aria-pressed={display === 'grid'}");
	});
});

describe('prototipos: datos inventados', () => {
	it('los mails son de dominios reservados', () => {
		for (const entry of readdirSync(path.join(ROOT, DIR), {
			recursive: true,
			withFileTypes: true
		})) {
			if (!entry.isFile() || !/\.(js|svelte)$/.test(entry.name)) continue;
			const src = readFileSync(path.join(entry.parentPath, entry.name), 'utf8');
			for (const m of src.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g))
				expect(m[1], entry.name).toMatch(/^(?:[a-z0-9-]+\.)*example\.invalid$/);
		}
	});
});

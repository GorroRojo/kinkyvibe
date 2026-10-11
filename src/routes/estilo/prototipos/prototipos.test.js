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

/** Cada página: el índice, un prototipo por carpeta y sus sub-páginas, con el componente que importa. */
const PAGES = [
	{ dir: DIR, component: './Indice.svelte' },
	...PROTOTIPOS.flatMap((p) => [p.slug, ...(p.paginas ?? []).map((sub) => `${p.slug}/${sub}`)]).map(
		(rel) => ({
			dir: `${DIR}/${rel}`,
			component: `./${read(`${DIR}/${rel}/+page.js`).match(/import\('\.\/([A-Za-z]+\.svelte)'\)/)?.[1]}`
		})
	)
];
/** @type {Record<string, () => Promise<any>>} */
const loaders = {
	[DIR]: () => import('./+page.js'),
	[`${DIR}/panel-nav`]: () => import('./panel-nav/+page.js'),
	[`${DIR}/panel-nav/secciones`]: () => import('./panel-nav/secciones/+page.js'),
	[`${DIR}/panel-nav/grilla`]: () => import('./panel-nav/grilla/+page.js'),
	[`${DIR}/panel-nav/propuesta`]: () => import('./panel-nav/propuesta/+page.js'),
	[`${DIR}/panel-nav/investigacion`]: () => import('./panel-nav/investigacion/+page.js')
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
		// Y cada sub-carpeta con página está en `paginas` de su prototipo (y al revés).
		for (const p of PROTOTIPOS) {
			const subs = readdirSync(path.join(ROOT, DIR, p.slug), { withFileTypes: true })
				.filter(
					(e) => e.isDirectory() && existsSync(path.join(ROOT, DIR, p.slug, e.name, '+page.js'))
				)
				.map((e) => e.name)
				.sort();
			expect(subs, p.slug).toEqual([...(p.paginas ?? [])].sort());
		}
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
				/import Marco from '(?:\.\.?\/)+Marco\.svelte'/
			);
		}
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

describe('prototipos: navegación del panel', () => {
	/**
	 * ¿Existe `sección:página` en el mapa de una opción? (`crear` e `importar` son sub-páginas de
	 * Eventos; en Ajustes cuenta cada página suelta.)
	 * @param {import('./panel-nav/datos.js').Seccion[]} secciones
	 * @param {string} destino
	 */
	const existe = (secciones, destino) => {
		const [s, p] = destino.split(':');
		const sec = secciones.find((x) => x.id === s);
		if (!sec) return false;
		if (s === 'eventos' && (p === 'crear' || p === 'importar')) return true;
		return sec.tabs.some((t) => t.id === p || t.partes?.some((x) => x.id === p));
	};

	it('cada ítem del menú de hoy tiene su lugar en las tres opciones (ninguno se pierde)', async () => {
		const { NAV } = await import('$lib/admin/nav.js');
		const { DESDE_NAV, SECCIONES, SECCIONES_C } = await import('./panel-nav/datos.js');
		const hoy = NAV.filter((i) => !i.soon).map((i) => i.id);
		expect(Object.keys(DESDE_NAV).sort()).toEqual([...hoy].sort());
		// En C la Puerta sale de Eventos y es su propia sección.
		/** @type {Record<string, string>} */
		const movidasC = { 'eventos:puerta': 'puerta:hoy' };
		for (const [id, destino] of Object.entries(DESDE_NAV)) {
			if (destino === 'accion') continue;
			expect(existe(SECCIONES, destino), `${id} en A y B`).toBe(true);
			expect(existe(SECCIONES_C, movidasC[destino] ?? destino), `${id} en C`).toBe(true);
		}
		// «Cargar evento» deja de ser un ítem del menú: es el botón de Eventos (y en C, de «Crear»).
		expect(SECCIONES.find((s) => s.id === 'eventos')?.accion?.t).toBe('crear');
	});

	it('la ficha del evento: A y B con las pestañas de hoy, C con todas (algunas juntas)', async () => {
		const { EVENT_TABS } = await import('$lib/admin/nav.js');
		const { PESTANAS_EVENTO, PESTANAS_EVENTO_C, PESTANAS_EVENTO_C_MAS, PESTANAS_EVENTO_DESDE_HOY } =
			await import('./panel-nav/datos.js');
		expect(PESTANAS_EVENTO.map((t) => t.label)).toEqual(EVENT_TABS.map((t) => t.label));
		expect(Object.keys(PESTANAS_EVENTO_DESDE_HOY).sort()).toEqual(
			EVENT_TABS.map((t) => t.id).sort()
		);
		const enC = [...PESTANAS_EVENTO_C, ...PESTANAS_EVENTO_C_MAS].map((t) => t.id);
		for (const destino of Object.values(PESTANAS_EVENTO_DESDE_HOY)) expect(enC).toContain(destino);
		// Pocas pestañas a la vista (NN/g): 5 y «Más».
		expect(PESTANAS_EVENTO_C.length).toBeLessThanOrEqual(5);
	});

	it('el índice compara las tres opciones y linkea la investigación', () => {
		const src = read(`${DIR}/panel-nav/PanelNav.svelte`);
		expect(src).toContain('href="/estilo/prototipos/panel-nav/investigacion"');
		expect(src).toContain('href="/estilo/prototipos/panel-nav/{o.slug}"');
	});

	it('cada opción dice en qué patrón se apoya, y cada hallazgo tiene su fuente', async () => {
		const { OPCIONES, TAREAS } = await import('./panel-nav/datos.js');
		const { HALLAZGOS, PATRON_DE } = await import('./panel-nav/investigacion.js');
		expect(OPCIONES.map((o) => o.slug)).toEqual(['secciones', 'grilla', 'propuesta']);
		for (const o of OPCIONES) {
			const def = PATRON_DE[/** @type {keyof typeof PATRON_DE} */ (o.slug)];
			expect(def?.patron, o.slug).toBeTruthy();
			for (const id of def.hallazgos) expect(HALLAZGOS.map((h) => h.id)).toContain(id);
			expect(read(`${DIR}/panel-nav/${o.slug}/+page.js`)).toBeTruthy();
		}
		expect(HALLAZGOS.length).toBeGreaterThanOrEqual(6);
		expect(HALLAZGOS.length).toBeLessThanOrEqual(10);
		for (const h of HALLAZGOS) {
			expect(h.fuentes.length, h.id).toBeGreaterThan(0);
			for (const f of h.fuentes) expect(f.url, h.id).toMatch(/^https:\/\//);
		}
		// La tabla de clics: las cinco tareas pedidas, con las tres opciones y hoy.
		expect(TAREAS).toHaveLength(5);
		for (const t of TAREAS) for (const k of ['hoy', 'A', 'B', 'C']) expect(t).toHaveProperty(k);
	});
});

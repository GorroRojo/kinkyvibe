/**
 * Guardas de la galería de componentes (/estilo, docs/estilo.md, «Componentes»): solo existe en
 * los deploys de preview y en `vite dev`. En producción da 404 y no entra en el bundle (como el
 * modo demo, docs/demo.md). Además lo controlan tests/smoke.spec.js (404 en un build sin rama de
 * deploy) y `node scripts/demo/guard.js bundle` (la marca de la galería no está en el Worker).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GALLERY_BUNDLE_MARKER, galleryIn } from '../../../scripts/demo/guard.js';
import { SECCIONES } from './secciones.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const read = (/** @type {string} */ rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE = 'src/routes/estilo/+page.js';
/** Las maquetas de la página de un evento (src/lib/estilo/evento/), con la misma condición. */
const MOCKUP_PAGE = 'src/routes/estilo/evento/[opcion]/+page.js';
const GATE =
	"if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe('galería /estilo: solo en previews y en dev', () => {
	it('fuera de dev y sin rama de preview (como producción), la página da 404', async () => {
		vi.stubEnv('DEV', false);
		vi.stubEnv('PROD', true);
		// En vitest no hay rama de deploy, como en el build de producción.
		expect(__DEPLOY_BRANCH__).toBe('');
		const { load } = await import('../../routes/estilo/+page.js');
		await expect(load(/** @type {any} */ ({}))).rejects.toMatchObject({ status: 404 });
	});

	it('en dev, la página carga la galería', async () => {
		vi.stubEnv('DEV', true);
		const { load } = await import('../../routes/estilo/+page.js');
		const data = /** @type {any} */ (await load(/** @type {any} */ ({})));
		expect(data?.Galeria).toBeTypeOf('function');
	});

	it('la galería se importa solo dentro de la condición de compilación', () => {
		const src = read(PAGE);
		const staticImports = src.match(/^import\s[^;]*;/gms) ?? [];
		for (const line of staticImports) expect(line).not.toMatch(/estilo/);
		const gate = src.indexOf(GATE);
		expect(gate).toBeGreaterThan(-1);
		const dynamic = src.indexOf("import('$lib/estilo/Galeria.svelte')");
		expect(dynamic).toBeGreaterThan(gate);
		// Lo que queda después del bloque es el 404.
		expect(src.indexOf("error(404, 'Not found')")).toBeGreaterThan(dynamic);
	});

	it('nada más de la app importa la galería', () => {
		/** @type {string[]} */
		const offenders = [];
		const dir = path.join(ROOT, 'src');
		for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !/\.(js|ts|svelte)$/.test(entry.name)) continue;
			if (/\.test\.js$/.test(entry.name)) continue;
			const full = path.join(entry.parentPath, entry.name);
			const rel = path.relative(ROOT, full);
			if (rel.startsWith('src/lib/estilo/') || rel === PAGE || rel === MOCKUP_PAGE) continue;
			if (/\$lib\/estilo\/|lib\/estilo\//.test(readFileSync(full, 'utf8'))) offenders.push(rel);
		}
		expect(offenders).toEqual([]);
	});

	it('la galería lleva la marca que busca el guard del bundle', () => {
		expect(read('src/lib/estilo/Galeria.svelte')).toContain(`'${GALLERY_BUNDLE_MARKER}'`);
		expect(galleryIn(`<div data-kv-estilo="${GALLERY_BUNDLE_MARKER}">`)).toBe(true);
		expect(galleryIn('export default { fetch() {} }')).toBe(false);
	});
});

describe('maquetas /estilo/evento/<opcion>: solo en previews y en dev', () => {
	const loadMockup = async () =>
		(await import('../../routes/estilo/evento/[opcion]/+page.js')).load;

	it('fuera de dev y sin rama de preview (como producción), la página da 404', async () => {
		vi.stubEnv('DEV', false);
		vi.stubEnv('PROD', true);
		expect(__DEPLOY_BRANCH__).toBe('');
		const load = await loadMockup();
		for (const opcion of ['actual', 'a', 'b', 'c'])
			await expect(load(/** @type {any} */ ({ params: { opcion } }))).rejects.toMatchObject({
				status: 404
			});
	});

	it('en dev, carga la maqueta pedida; una opción que no existe da 404', async () => {
		vi.stubEnv('DEV', true);
		const load = await loadMockup();
		const data = /** @type {any} */ (await load(/** @type {any} */ ({ params: { opcion: 'b' } })));
		expect(data?.Mockup).toBeTypeOf('function');
		expect(data?.opcion).toBe('b');
		await expect(
			load(/** @type {any} */ ({ params: { opcion: 'inventada' } }))
		).rejects.toMatchObject({ status: 404 });
	}, 60_000); // importa la página real del evento y sus componentes: tarda en transformarse

	it('las maquetas se importan solo dentro de la condición de compilación', () => {
		const src = read(MOCKUP_PAGE);
		const staticImports = src.match(/^import\s[^;]*;/gms) ?? [];
		for (const line of staticImports) expect(line).not.toMatch(/estilo/);
		const gate = src.indexOf(GATE);
		expect(gate).toBeGreaterThan(-1);
		const dynamic = src.indexOf("import('$lib/estilo/evento/Mockup.svelte')");
		expect(dynamic).toBeGreaterThan(gate);
		expect(src.indexOf("error(404, 'Not found')")).toBeGreaterThan(dynamic);
	});

	it('las maquetas llevan la marca que busca el guard del bundle', () => {
		expect(read('src/lib/estilo/evento/Mockup.svelte')).toContain(`'${GALLERY_BUNDLE_MARKER}'`);
	});

	it('los datos de las maquetas son inventados (mails y links de dominios reservados)', () => {
		const dir = path.join(ROOT, 'src/lib/estilo/evento');
		for (const name of readdirSync(dir)) {
			const src = readFileSync(path.join(dir, name), 'utf8');
			for (const m of src.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g))
				expect(m[1], name).toMatch(/^(?:[a-z0-9-]+\.)*example\.invalid$/);
			for (const m of src.matchAll(/https?:\/\/([A-Za-z0-9.-]+)/g))
				expect(m[1], name).toMatch(/^(?:[a-z0-9-]+\.)*example\.invalid$|^www\.w3\.org$/);
		}
	});
});

describe('galería /estilo: contenido', () => {
	it('una sección por componente del barril, con import, cuándo usarlo y cuándo no', () => {
		const barrel = read('src/lib/components/ui/index.js');
		for (const s of SECCIONES) {
			expect(s.id).toMatch(/^[a-z]+$/);
			expect(s.cuando.length).toBeGreaterThan(20);
			expect(s.cuandoNo.length).toBeGreaterThan(10);
			const names = s.importa.match(/import \{ ([^}]+) \} from '\$lib\/components\/ui';/)?.[1];
			expect(names, s.importa).toBeTruthy();
			for (const n of /** @type {string} */ (names).split(',').map((x) => x.trim()))
				expect(barrel).toMatch(new RegExp(`export \\{ (default as )?${n} \\}`));
		}
		expect(new Set(SECCIONES.map((s) => s.id)).size).toBe(SECCIONES.length);
	});

	it('los datos de ejemplo son inventados (mails de dominios reservados)', () => {
		const src = read('src/lib/estilo/Galeria.svelte');
		const domains = [...src.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)];
		for (const m of domains) expect(m[1]).toMatch(/^(?:[a-z0-9-]+\.)*example\.invalid$/);
	});
});

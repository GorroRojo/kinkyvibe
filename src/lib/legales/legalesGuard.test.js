/**
 * Guardas de los borradores legales (/legales, docs/legales.md): solo existen en los deploys de
 * preview y en `vite dev`, como la galería /estilo (src/lib/estilo/estiloGuard.test.js). En
 * producción dan 404 y no entran en el bundle. Además lo controlan tests/smoke.spec.js (404 en un
 * build sin rama de deploy) y `node scripts/demo/guard.js bundle` (la marca no está en el Worker).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGALES_BUNDLE_MARKER, legalesIn } from '../../../scripts/demo/guard.js';
import { PAGINAS } from './paginas.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const read = (/** @type {string} */ rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE = 'src/routes/(content)/legales/[[pagina]]/+page.js';
const GATE =
	"if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {";
const SLUGS = [undefined, ...PAGINAS.map((p) => p.slug)];

const loadPage = async () =>
	(await import('../../routes/(content)/legales/[[pagina]]/+page.js')).load;

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe('borradores legales: solo en previews y en dev', () => {
	it.each(SLUGS)(
		'fuera de dev y sin rama de preview (como producción), /legales/%s da 404',
		async (pagina) => {
			vi.stubEnv('DEV', false);
			vi.stubEnv('PROD', true);
			// En vitest no hay rama de deploy, como en el build de producción.
			expect(__DEPLOY_BRANCH__).toBe('');
			const load = await loadPage();
			await expect(load(/** @type {any} */ ({ params: { pagina } }))).rejects.toMatchObject({
				status: 404
			});
		}
	);

	it.each(SLUGS)('en dev, /legales/%s carga su página', async (pagina) => {
		vi.stubEnv('DEV', true);
		const load = await loadPage();
		const data = /** @type {any} */ (await load(/** @type {any} */ ({ params: { pagina } })));
		expect(data?.Componente).toBeTypeOf('function');
		expect(data?.titulo).toBeTruthy();
		expect(data?.paginas).toEqual(PAGINAS);
	});

	it('en dev, una página que no existe da 404', async () => {
		vi.stubEnv('DEV', true);
		const load = await loadPage();
		await expect(
			load(/** @type {any} */ ({ params: { pagina: 'no-existe' } }))
		).rejects.toMatchObject({ status: 404 });
	});

	it('los borradores se importan solo dentro de la condición de compilación', () => {
		const src = read(PAGE);
		const staticImports = src.match(/^import\s[^;]*;/gms) ?? [];
		for (const line of staticImports) expect(line).not.toMatch(/legales/);
		const gate = src.indexOf(GATE);
		expect(gate).toBeGreaterThan(-1);
		const dynamic = src.indexOf("import('$lib/legales/paginas.js')");
		expect(dynamic).toBeGreaterThan(gate);
		// Lo que queda después del bloque es el 404.
		expect(src.indexOf("error(404, 'Not found')")).toBeGreaterThan(dynamic);
	});

	it('nada más de la app importa los borradores', () => {
		/** @type {string[]} */
		const offenders = [];
		const dir = path.join(ROOT, 'src');
		for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !/\.(js|ts|svelte)$/.test(entry.name)) continue;
			if (/\.test\.js$/.test(entry.name)) continue;
			const full = path.join(entry.parentPath, entry.name);
			const rel = path.relative(ROOT, full);
			if (rel.startsWith('src/lib/legales/') || rel === PAGE) continue;
			if (/\$lib\/legales\/|lib\/legales\//.test(readFileSync(full, 'utf8'))) offenders.push(rel);
		}
		expect(offenders).toEqual([]);
	});

	it('el marco de los borradores lleva la marca que busca el guard del bundle', () => {
		expect(read('src/lib/legales/Legal.svelte')).toContain(`'${LEGALES_BUNDLE_MARKER}'`);
		expect(legalesIn(`<article data-kv-legales="${LEGALES_BUNDLE_MARKER}">`)).toBe(true);
		expect(legalesIn('export default { fetch() {} }')).toBe(false);
	});
});

describe('borradores legales: contenido', () => {
	const files = readdirSync(path.join(ROOT, 'src/lib/legales')).filter((f) =>
		f.endsWith('.svelte')
	);

	it('cada página tiene su componente y usa el marco con el aviso de borrador', () => {
		for (const p of PAGINAS) {
			expect(p.slug).toMatch(/^[a-z-]+$/);
			expect(p.resumen.length).toBeGreaterThan(20);
			const name = p.slug[0].toUpperCase() + p.slug.slice(1) + '.svelte';
			expect(files).toContain(name);
			expect(read(`src/lib/legales/${name}`)).toMatch(/<Legal\s/);
		}
		expect(new Set(PAGINAS.map((p) => p.slug)).size).toBe(PAGINAS.length);
		expect(read('src/lib/legales/Legal.svelte')).toContain('Borrador sin publicar.');
	});

	it('cada página tiene notas «Para revisar» y cada sección del índice existe', () => {
		for (const p of PAGINAS) {
			const name = p.slug[0].toUpperCase() + p.slug.slice(1) + '.svelte';
			const src = read(`src/lib/legales/${name}`);
			expect(src, name).toMatch(/<Revisar>/);
			for (const [, id] of src.matchAll(/\{ id: '([a-z-]+)', titulo:/g))
				expect(src, `${name}#${id}`).toContain(`<section id="${id}">`);
		}
	});

	it('sin datos de personas: los únicos mails son el contacto público de la organización', () => {
		for (const f of files) {
			const src = read(`src/lib/legales/${f}`);
			expect(src, f).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]/);
			expect(src, f).not.toMatch(/t\.me\//);
		}
	});
});

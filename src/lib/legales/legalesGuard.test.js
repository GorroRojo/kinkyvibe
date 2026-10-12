/**
 * Guardas del borrador legal (/legales, docs/legales.md): solo existe en los deploys de preview y
 * en `vite dev`, como la galería /estilo (src/lib/estilo/estiloGuard.test.js). En producción da
 * 404 y no entra en el bundle. Además lo controlan tests/smoke.spec.js (404 en un
 * build sin rama de deploy) y `node scripts/demo/guard.js bundle` (la marca no está en el Worker).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEGALES_BUNDLE_MARKER, legalesIn } from '../../../scripts/demo/guard.js';
import { CONTACTO_LEGALES } from './legales.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const read = (/** @type {string} */ rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const PAGE = 'src/routes/(content)/legales/+page.js';
const GATE =
	"if (import.meta.env.DEV || (__DEPLOY_BRANCH__ !== '' && __DEPLOY_BRANCH__ !== 'main')) {";

const loadPage = async () => (await import('../../routes/(content)/legales/+page.js')).load;

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe('borrador legal: solo en previews y en dev', () => {
	it('fuera de dev y sin rama de preview (como producción), /legales da 404', async () => {
		vi.stubEnv('DEV', false);
		vi.stubEnv('PROD', true);
		// En vitest no hay rama de deploy, como en el build de producción.
		expect(__DEPLOY_BRANCH__).toBe('');
		const load = await loadPage();
		await expect(load(/** @type {any} */ ({ params: {} }))).rejects.toMatchObject({
			status: 404
		});
	});

	it('en dev, /legales carga la página', async () => {
		vi.stubEnv('DEV', true);
		const load = await loadPage();
		const data = /** @type {any} */ (await load(/** @type {any} */ ({ params: {} })));
		expect(data?.Componente).toBeTypeOf('function');
		expect(data?.titulo).toBeTruthy();
	});

	it('el borrador se importa solo dentro de la condición de compilación', () => {
		const src = read(PAGE);
		const staticImports = src.match(/^import\s[^;]*;/gms) ?? [];
		for (const line of staticImports) expect(line).not.toMatch(/legales/);
		const gate = src.indexOf(GATE);
		expect(gate).toBeGreaterThan(-1);
		const dynamic = src.indexOf("import('$lib/legales/legales.js')");
		expect(dynamic).toBeGreaterThan(gate);
		// Lo que queda después del bloque es el 404.
		expect(src.indexOf("error(404, 'Not found')")).toBeGreaterThan(dynamic);
	});

	it('nada más de la app importa el borrador', () => {
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

	it('la página lleva la marca que busca el guard del bundle', () => {
		expect(read('src/lib/legales/Legales.svelte')).toContain(`'${LEGALES_BUNDLE_MARKER}'`);
		expect(legalesIn(`<article data-kv-legales="${LEGALES_BUNDLE_MARKER}">`)).toBe(true);
		expect(legalesIn('export default { fetch() {} }')).toBe(false);
	});
});

describe('borrador legal: contenido', () => {
	const files = readdirSync(path.join(ROOT, 'src/lib/legales')).filter((f) =>
		f.endsWith('.svelte')
	);
	const pagina = read('src/lib/legales/Legales.svelte');

	it('lleva el aviso de borrador, la leyenda de la AAIP y pocas notas «Para revisar»', () => {
		expect(pagina).toContain('Borrador sin publicar.');
		expect(pagina).toContain('LA AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA');
		const notas = pagina.match(/<Revisar>/g) ?? [];
		expect(notas.length).toBeGreaterThan(0);
		expect(notas.length).toBeLessThanOrEqual(5);
	});

	it('sin datos de personas: el único mail es el contacto general de la organización', () => {
		for (const f of files) {
			const src = read(`src/lib/legales/${f}`);
			expect(src, f).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]/);
			expect(src, f).not.toMatch(/t\.me\//);
		}
		const mails = read('src/lib/legales/legales.js').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g);
		expect(mails).toEqual([CONTACTO_LEGALES]);
		expect(CONTACTO_LEGALES).toBe('kinkyvibeargentina@gmail.com');
	});
});

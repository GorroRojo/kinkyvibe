/**
 * Guardia de los links «volver» del panel (opción C, parte 2, gorrite 11/10): cada «← …», cada
 * `back={{ href }}` de PageHeader y cada «Volver a…» de las páginas del panel tiene que llevar a
 * una página que existe y que no es «Próximamente». Lo mismo cada «← Área» de `areaBackLink` y
 * las secciones de la barra lateral y de las pestañas.
 *
 * Las partes dinámicas (`{slug}`, `${slug}`) valen como cualquier segmento. Los `back` armados con
 * una variable no se pueden leer acá: van en {@link DYNAMIC_BACKS}, con dónde se arma cada uno (si
 * aparece uno nuevo, la prueba lo pide).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NAV, areaBackLink, sectionTabs, sideSections, soonItemAt } from '$lib/admin/nav.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const ROUTES = join(ROOT, 'src', 'routes');
const SCAN = [join(ROUTES, '(authed)', 'admin'), join(ROOT, 'src', 'lib', 'components', 'admin')];
const PAGE_FILES = ['+page.svelte', '+page.server.js', '+page.js', '+server.js'];

/**
 * `back` armados con una variable, por archivo (relativo a la raíz) y la expresión. Cada uno se
 * revisó a mano: lleva a la lista de la que viene la página.
 */
const DYNAMIC_BACKS = {
	// La lista de órdenes del evento (`eventHref(slug, 'ordenes')`).
	'src/routes/(authed)/admin/eventos/[slug]/ordenes/cargar/+page.svelte': ['ordersHref'],
	// Comunidad › Perfiles (`contentAdminHref('amigues')`).
	'src/routes/(authed)/admin/comunidad/cuentas/perfiles/[id]/+page.svelte': ['PROFILES_HREF'],
	// La lista de lo que se borra (`deletionRoutes.js`, `info.list`): el `back` y «Volver a la lista».
	'src/routes/(authed)/admin/borrar/[kind]/[slug]/+page.svelte': [
		'data.info.list',
		'data.info.list'
	],
	// «← Volver a la publicación»: la página pública (fuera del panel).
	'src/lib/components/admin/PostEditor.svelte': ["'/' + category + '/' + postID"],
	// La lista de su categoría (`contentAdminHref`).
	'src/lib/components/admin/content/ContentEditor.svelte': ['listHref'],
	// «← Mensajes» y similares: `areaBackLink` (se prueba abajo).
	'src/routes/(authed)/admin/mensajes/configuracion/+page.svelte': [
		"areaBackLink('ajustes-mails')"
	],
	'src/routes/(authed)/admin/mensajes/plantillas/+page.svelte': [
		"areaBackLink('ajustes-plantillas')"
	]
};

/** @param {string} dir @returns {string[]} */
function walk(dir) {
	/** @type {string[]} */
	const out = [];
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out;
}

/** Rutas del panel como segmentos (sin grupos), sin el 404 del panel (`[...rest]`). */
const routes = [
	...new Set(
		walk(ROUTES)
			.filter((f) => PAGE_FILES.some((r) => f.endsWith(`/${r}`)))
			.map((f) => relative(ROUTES, f).split('/').slice(0, -1).join('/'))
			.filter((d) => d !== '(authed)/admin/[...rest]')
	)
]
	.map((d) => d.split('/').filter((s) => s && !/^\(.*\)$/.test(s)))
	.filter((segs) => segs[0] === 'admin');

/** Un segmento dinámico (`{…}` o `${…}`). */
const ANY = '\u0000';

/**
 * ¿Lleva a una página que existe? La página «Próximamente» (`[...section=soon]`) no cuenta.
 * @param {string} href
 */
function existingPage(href) {
	const path = href.replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';
	if (soonItemAt(path)) return false;
	const segs = path
		.replace(/\$?\{[^}]*\}/g, ANY)
		.split('/')
		.filter(Boolean);
	return routes.some((route) => {
		if (route.some((r) => r.startsWith('[...'))) return false;
		if (route.length !== segs.length) return false;
		return route.every((r, i) => segs[i] === r || segs[i].includes(ANY) || /^\[.+\]$/.test(r));
	});
}

/**
 * Los links «volver» de un archivo: `back={{ href: … }}`, `<a … href="…">← …` y
 * `<a … href="…">Volver …`. Devuelve los literales y las expresiones.
 * @param {string} text
 */
function backLinksIn(text) {
	/** @type {string[]} */
	const literal = [];
	/** @type {string[]} */
	const dynamic = [];
	for (const m of text.matchAll(/back=\{\{\s*href:\s*([^,}]+)/g)) {
		const v = m[1].trim();
		const q = v.match(/^(['"`])(.*)\1$/);
		if (q) literal.push(q[2]);
		else dynamic.push(v);
	}
	for (const m of text.matchAll(/back=\{(?!\{)([^}]+)\}/g)) dynamic.push(m[1].trim());
	for (const m of text.matchAll(/<a\b[^>]*\bhref=(?:"([^"]*)"|\{([^}]*)\})[^>]*>\s*(←|Volver)/g)) {
		if (m[1] !== undefined) literal.push(m[1]);
		else dynamic.push(m[2].trim());
	}
	return { literal, dynamic };
}

describe('links «volver» del panel', () => {
	const files = SCAN.flatMap(walk).filter((f) => /\.svelte$/.test(f));

	it('encuentra los links (la prueba lee algo)', () => {
		const all = files.flatMap((f) => backLinksIn(readFileSync(f, 'utf8')).literal);
		expect(all.length).toBeGreaterThan(10);
		expect(existingPage('/admin/eventos')).toBe(true);
		expect(existingPage('/admin/eventos/{slug}/mails')).toBe(true);
		expect(existingPage('/admin/mensajes')).toBe(false); // «Próximamente»
		expect(existingPage('/admin/inventada')).toBe(false);
	});

	it('cada uno lleva a una página que existe y no es «Próximamente»', () => {
		/** @type {string[]} */
		const broken = [];
		for (const file of files) {
			for (const href of backLinksIn(readFileSync(file, 'utf8')).literal) {
				// Fuera del panel (la publicación, el sitio): no es de esta prueba.
				if (!href.startsWith('/admin')) continue;
				if (!existingPage(href)) broken.push(`${relative(ROOT, file)}: ${href}`);
			}
		}
		expect(broken).toEqual([]);
	});

	it('los armados con una variable están revisados (DYNAMIC_BACKS)', () => {
		/** @type {Record<string, string[]>} */
		const found = {};
		for (const file of files) {
			const { dynamic } = backLinksIn(readFileSync(file, 'utf8'));
			if (dynamic.length) found[relative(ROOT, file)] = dynamic;
		}
		expect(found).toEqual(DYNAMIC_BACKS);
	});

	it('«← Área» (areaBackLink): a una página que existe y no es «Próximamente», o nada', () => {
		for (const item of NAV) {
			const back = areaBackLink(item.id);
			if (back) expect(existingPage(back.href), item.id).toBe(true);
		}
		// Mensajes todavía no tiene página (la Bandeja viene): Plantillas no tiene «← Mensajes».
		expect(areaBackLink('ajustes-plantillas')).toBe(null);
	});

	it('las secciones de la barra y todas las pestañas llevan a páginas que existen', () => {
		for (const s of sideSections()) expect(existingPage(s.href), s.id).toBe(true);
		for (const item of NAV.filter((i) => !i.soon)) {
			for (const tab of sectionTabs(item.href, { hideSoon: false })?.tabs ?? []) {
				if (tab.soon) expect(existingPage(tab.href), tab.href).toBe(false);
				else expect(existingPage(tab.href), tab.href).toBe(true);
			}
		}
	});

	it('las páginas con pestañas de sección no tienen «← …» a otra pestaña (son hermanas)', () => {
		/** @type {string[]} */
		const siblings = [];
		for (const item of NAV.filter((i) => !i.soon)) {
			const tabs = sectionTabs(item.href)?.tabs ?? [];
			if (!tabs.length) continue;
			const file = join(ROUTES, '(authed)', item.href.replace(/^\//, ''), '+page.svelte');
			let text = '';
			try {
				text = readFileSync(file, 'utf8');
			} catch {
				continue;
			}
			for (const href of backLinksIn(text).literal) {
				if (tabs.some((t) => t.href === href)) siblings.push(`${item.href} → ${href}`);
			}
		}
		expect(siblings).toEqual([]);
	});
});

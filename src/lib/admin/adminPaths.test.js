/**
 * Guardia: cada dirección `/admin/...` escrita en el código (fuera de las pruebas) tiene que
 * llevar a una ruta que existe en `src/routes`. Así un link a una página mudada o borrada (como
 * los viejos `/admin/ventas/<evento>`) falla acá y no en la puerta de un evento.
 *
 * Las partes dinámicas (`${slug}` en JS, `{slug}` en Svelte) valen como cualquier segmento.
 * Lo que va después de `?` o `#` no se mira.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { match as soonMatcher } from '../../params/soon.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');
const ROUTES = join(SRC, 'routes');
const ROUTE_FILES = ['+page.svelte', '+page.server.js', '+page.js', '+server.js'];
/**
 * Matchers de `src/params` que usan las rutas del panel: un `[...x=matcher]` solo toma lo que el
 * matcher acepta (si no, una ruta así coincidiría con cualquier dirección).
 * @type {Record<string, (param: string) => boolean>}
 */
const MATCHERS = { soon: soonMatcher };
/** Un segmento armado en el momento (`${…}` o `{…}`): coincide con cualquiera. */
const ANY = '\u0000';

/** @param {string} dir @returns {string[]} */
function walk(dir) {
	/** @type {string[]} */
	const out = [];
	for (const name of readdirSync(dir)) {
		if (name === 'node_modules' || name.startsWith('.')) continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else out.push(p);
	}
	return out;
}

/**
 * Rutas del panel, como listas de segmentos (sin grupos `(…)`). Un segmento `[x]` o `[x=y]` es
 * dinámico; `[...x]` toma todo lo que sigue.
 * @returns {string[][]}
 */
function adminRoutes() {
	const dirs = new Set(
		walk(ROUTES)
			.filter((f) => ROUTE_FILES.some((r) => f.endsWith(`/${r}`)))
			.map((f) => relative(ROUTES, f).split('/').slice(0, -1).join('/'))
	);
	return [...dirs]
		.map((d) => d.split('/').filter((s) => s && !/^\(.*\)$/.test(s)))
		.filter((segs) => segs[0] === 'admin');
}

/**
 * Las direcciones `/admin…` que aparecen entre comillas en un archivo. Recorre a mano para saltar
 * las partes dinámicas con llaves anidadas (`${f({ a })}`).
 * @param {string} text
 * @returns {string[]}
 */
function adminPathsIn(text) {
	/** @type {string[]} */
	const out = [];
	const re = /(["'`])\/admin(?=[/"'`?#])/g;
	let m;
	while ((m = re.exec(text))) {
		const quote = m[1];
		let i = m.index + 1;
		let path = '';
		while (i < text.length) {
			const c = text[i];
			if (c === quote || c === '?' || c === '#' || /\s/.test(c)) break;
			if (c === '{' || (c === '$' && text[i + 1] === '{')) {
				let depth = 0;
				if (c === '$') i++;
				for (; i < text.length; i++) {
					if (text[i] === '{') depth++;
					else if (text[i] === '}' && --depth === 0) break;
				}
				path += ANY;
				i++;
				continue;
			}
			path += c;
			i++;
		}
		out.push(path);
	}
	return out;
}

/**
 * ¿La dirección lleva a alguna ruta? Un segmento con una parte dinámica vale como cualquiera.
 * @param {string} path
 * @param {string[][]} routes
 */
function matchesRoute(path, routes) {
	const segs = path.replace(/\/+$/, '').split('/').filter(Boolean);
	return routes.some((route) => {
		for (let i = 0; i < route.length; i++) {
			const r = route[i];
			const rest = r.match(/^\[\.\.\.[^=\]]+(?:=([^\]]+))?\]$/);
			if (rest) {
				if (!rest[1]) return true;
				const matcher = MATCHERS[rest[1]];
				if (!matcher) throw new Error(`Falta el matcher «${rest[1]}» en adminPaths.test.js`);
				return matcher(segs.slice(i).join('/'));
			}
			const s = segs[i];
			if (s === undefined) return false;
			if (s.includes(ANY) || /^\[.+\]$/.test(r)) continue;
			if (s !== r) return false;
		}
		return segs.length === route.length;
	});
}

describe('direcciones /admin escritas en el código', () => {
	const routes = adminRoutes();

	it('encuentra las rutas del panel', () => {
		expect(routes.length).toBeGreaterThan(20);
		expect(matchesRoute('/admin/eventos/x/ordenes', routes)).toBe(true);
		expect(matchesRoute('/admin/ventas/x/ingreso', routes)).toBe(false);
		// La página "Próximamente" solo toma las direcciones reservadas.
		expect(matchesRoute('/admin/mensajes', routes)).toBe(true);
		expect(matchesRoute('/admin/mensajes/inventada', routes)).toBe(false);
	});

	it('lee las partes dinámicas de JS y de Svelte', () => {
		const found = adminPathsIn(
			'a("/admin/{category}/nuevo?desde={x}") b(`/admin/x/${f({ a: 1 })}/y#z`) c("/administra")'
		);
		expect(found).toEqual([`/admin/${ANY}/nuevo`, `/admin/x/${ANY}/y`]);
	});

	it('cada una lleva a una ruta que existe', () => {
		/** @type {string[]} */
		const broken = [];
		for (const file of walk(SRC)) {
			if (!/\.(js|svelte)$/.test(file) || /\.test\.js$/.test(file)) continue;
			for (const path of adminPathsIn(readFileSync(file, 'utf8'))) {
				if (!matchesRoute(path, routes)) {
					broken.push(`${relative(ROOT, file)}: ${path.replaceAll(ANY, '{…}')}`);
				}
			}
		}
		expect(broken).toEqual([]);
	});
});

/**
 * Páginas borradas cuya dirección igual "existe" porque la toma una ruta dinámica vecina (por
 * ejemplo `/admin/comunidad/cuentas/perfiles` cae en `/admin/comunidad/cuentas/[id]` y da 404),
 * así que la prueba de arriba no las ve. Ningún link, mail, documento ni prueba puede apuntar a
 * ellas (regla del mapa del panel: los favoritos se pueden romper, lo nuestro no).
 */
const REMOVED = [
	// La lista de perfiles de Cuentas: ahora es Comunidad › Perfiles (/admin/comunidad/perfiles).
	// La ficha de cada perfil (/admin/comunidad/cuentas/perfiles/<id>) sigue.
	'/admin/comunidad/cuentas/perfiles'
];

/**
 * Direcciones viejas del panel, con todo lo que colgaba de ellas. El paso 2 del mapa del panel
 * las mudó a `/admin/<área>/<sección>` sin redirecciones (decisión de gorrite): nada nuestro
 * puede seguir apuntando a ellas, ni siquiera en una prueba o un documento.
 */
const REMOVED_TREES = [
	'/admin/entradas', // → /admin/ventas (y /admin/entradas/ajustes se borró: era solo un redirect)
	'/admin/personas', // → /admin/comunidad/personas
	'/admin/amigues', // → /admin/comunidad/perfiles
	'/admin/cuentas', // → /admin/comunidad/cuentas
	'/admin/ajustes/mails/plantillas', // → /admin/mensajes/plantillas
	'/admin/ajustes/personas', // → /admin/eventos/roles
	'/admin/material', // → /admin/contenido/material
	'/admin/no-listadas', // → /admin/contenido/no-listadas
	'/admin/actividad', // → /admin/ajustes/actividad
	'/admin/propinas' // → /admin/ajustes/propinas
];

/**
 * Dónde empieza una dirección del panel: no pegada a una palabra (así `lib/server/admin/cuentas.js`
 * no cuenta), salvo después de un dominio (`https://kinkyvibe.ar/admin/…`, `localhost:5173/admin/…`).
 */
const START = String.raw`(?:(?<![\w$])|(?<=kinkyvibe\.ar|localhost|:\d+))`;

/** @param {string} path */
const escape = (path) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Archivos donde se buscan direcciones viejas: código, pruebas, documentos y configuración. */
function textFiles() {
	return [
		...walk(SRC).filter((f) => /\.(js|svelte|md)$/.test(f)),
		...walk(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')),
		...walk(join(ROOT, 'tests')).filter((f) => /\.(js|ts)$/.test(f)),
		...walk(join(ROOT, 'scripts')).filter((f) => f.endsWith('.js')),
		...readdirSync(ROOT)
			.filter((f) => /\.(js|md)$/.test(f))
			.map((f) => join(ROOT, f))
	].filter((f) => f !== import.meta.filename);
}

describe('direcciones borradas', () => {
	const files = textFiles().map((f) => ({
		name: relative(ROOT, f),
		text: readFileSync(f, 'utf8')
	}));

	it('nada apunta a una página borrada (código, pruebas, docs)', () => {
		/** @type {string[]} */
		const hits = [];
		for (const { name, text } of files) {
			for (const path of REMOVED) {
				// La dirección sola (con o sin `?…`), no una subpágina suya.
				const re = new RegExp(`${START}${escape(path)}(?![/\\w-])`);
				if (re.test(text)) hits.push(`${name}: ${path}`);
			}
		}
		expect(hits).toEqual([]);
	});

	it('nada apunta a una dirección vieja del panel ni a lo que colgaba de ella', () => {
		/** @type {string[]} */
		const hits = [];
		for (const { name, text } of files) {
			for (const path of REMOVED_TREES) {
				const re = new RegExp(`${START}${escape(path)}(?![\\w-])`, 'g');
				for (const m of text.matchAll(re)) {
					const line = text.slice(0, m.index).split('\n').length;
					hits.push(`${name}:${line}: ${path}`);
				}
			}
		}
		expect(hits).toEqual([]);
	});

	it('ve las direcciones viejas con dominio y no confunde archivos de código', () => {
		const re = new RegExp(`${START}${escape('/admin/cuentas')}(?![\\w-])`);
		expect(re.test('fetch("https://kinkyvibe.ar/admin/cuentas/3")')).toBe(true);
		expect(re.test('`http://localhost:5173/admin/cuentas`')).toBe(true);
		expect(re.test("href='/admin/cuentas?x=1'")).toBe(true);
		expect(re.test("import x from '$lib/server/admin/cuentas.js'")).toBe(false);
		expect(re.test("'/admin/cuentas-viejas'")).toBe(false);
	});

	it('ninguna ruta vieja sigue existiendo', () => {
		const routes = adminRoutes().map((segs) => '/' + segs.join('/'));
		for (const path of REMOVED_TREES) {
			expect(routes.filter((r) => r === path || r.startsWith(path + '/'))).toEqual([]);
		}
	});
});

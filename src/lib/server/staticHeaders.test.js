/**
 * El `_headers` de la raíz (headers de los archivos de static/, docs/workers-migracion.md): solo
 * archivos estáticos que existen, nada que pueda tocar las páginas, y nunca una caché larga en un
 * archivo sin hash en el nombre.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '../../..');
const STATIC = join(ROOT, 'static');

/** Lo más largo que puede guardar el navegador un archivo cuyo nombre no cambia (1 día). */
const MAX_AGE_LIMIT = 86400;

/** Archivos de static/ que se dejan con el header por defecto a propósito. */
const DEFAULT_ON_PURPOSE = new Set(['robots.txt']);

/**
 * Las reglas del archivo: ruta → headers (nombre en minúscula → valor).
 * @param {string} text
 */
function parseHeaders(text) {
	/** @type {{ path: string, headers: Record<string, string> }[]} */
	const rules = [];
	for (const raw of text.split('\n')) {
		if (!raw.trim() || raw.trim().startsWith('#')) continue;
		if (!/^\s/.test(raw)) {
			rules.push({ path: raw.trim(), headers: {} });
			continue;
		}
		const rule = rules.at(-1);
		if (!rule) throw new Error(`header sin ruta: ${raw}`);
		const i = raw.indexOf(':');
		rule.headers[raw.slice(0, i).trim().toLowerCase()] = raw.slice(i + 1).trim();
	}
	return rules;
}

/** Carpetas de las rutas de SvelteKit en el primer nivel de la URL (sin los grupos `(x)`). */
function topLevelRouteSegments(dir = join(ROOT, 'src/routes')) {
	/** @type {string[]} */
	const out = [];
	for (const name of readdirSync(dir)) {
		if (!statSync(join(dir, name)).isDirectory()) continue;
		if (/^\(.*\)$/.test(name)) out.push(...topLevelRouteSegments(join(dir, name)));
		else out.push(name);
	}
	return out;
}

const allRules = parseHeaders(readFileSync(join(ROOT, '_headers'), 'utf8'));

/**
 * La única regla para todo (`/*`): los headers de seguridad de securityHeaders.js para los
 * estáticos, que no pasan por el Worker. Nunca caché ni otra cosa.
 */
const SECURITY_ALL = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin'
};
const rules = allRules.filter((r) => r.path !== '/*');

describe('_headers', () => {
	it('tiene reglas y no está en static/ (el adapter falla si lo encuentra ahí)', () => {
		expect(rules.length).toBeGreaterThan(0);
		expect(existsSync(join(STATIC, '_headers'))).toBe(false);
	});

	it('ninguna regla es amplia ni apunta a páginas, HTML o /_app/ (salvo `/*` de seguridad)', () => {
		const all = allRules.filter((r) => r.path === '/*');
		expect(all).toHaveLength(1);
		expect(all[0].headers).toEqual(SECURITY_ALL);
		for (const { path } of rules) {
			expect(path.startsWith('/'), path).toBe(true);
			expect(path, 'sin host ni regla para todo').not.toMatch(/^\/\*|^\/$|:\/\//);
			expect(path, 'sin HTML').not.toMatch(/\.html?$|\/$/);
			expect(path, 'lo de /_app/ lo pone el adapter').not.toMatch(/^\/_app\b/);
			expect(path.split('*').length - 1, 'a lo sumo un * y al final').toBeLessThanOrEqual(1);
			if (path.includes('*')) expect(path).toMatch(/^\/[^/*]+\/\*$/);
		}
	});

	it('cada regla es un archivo o una carpeta de static/ que no comparte nombre con una ruta', () => {
		const routes = topLevelRouteSegments();
		for (const { path } of rules) {
			if (path.endsWith('/*')) {
				const dir = path.slice(1, -2);
				expect(statSync(join(STATIC, dir)).isDirectory(), path).toBe(true);
				expect(routes, `${path} no puede ser también una ruta`).not.toContain(dir);
			} else {
				expect(statSync(join(STATIC, path.slice(1))).isFile(), path).toBe(true);
			}
		}
	});

	it('solo Cache-Control moderado: público, ≤ 1 día, nunca immutable', () => {
		for (const { path, headers } of rules) {
			expect(Object.keys(headers), path).toEqual(['cache-control']);
			const value = headers['cache-control'];
			expect(value, path).not.toMatch(/immutable/i);
			const maxAge = Number(/max-age=(\d+)/.exec(value)?.[1]);
			expect(maxAge, path).toBeGreaterThan(0);
			expect(maxAge, path).toBeLessThanOrEqual(MAX_AGE_LIMIT);
			expect(value, path).toMatch(/^public,/);
		}
	});

	it('cubre todos los archivos del primer nivel de static/ (íconos, manifest, og-*)', () => {
		const paths = new Set(rules.map((r) => r.path));
		for (const name of readdirSync(STATIC)) {
			const isDir = statSync(join(STATIC, name)).isDirectory();
			if (DEFAULT_ON_PURPOSE.has(name)) continue;
			expect(paths.has(isDir ? `/${name}/*` : `/${name}`), name).toBe(true);
		}
	});
});

import { describe, expect, test, vi } from 'vitest';
import { parseDate, render, sortByPublished } from './sitemap.js';
import { GET } from './+server.js';

// Compilar los ~600 posts reales tardaba ~20 s. Acá alcanzan unos de muestra; el sitemap real
// (prerenderizado en el build) lo revisa tests/smoke.spec.js.
vi.mock('$lib/utils', () => ({
	fetchMarkdownPosts: async (/** @type {boolean} */ wiki) =>
		wiki
			? [{ path: '/wiki/BDSM', meta: {} }]
			: [
					{ path: '/calendario/fiesta', meta: { published_date: '2026-09-29Z-03:00' } },
					{ path: '/material/sin-fecha', meta: {} }
				]
}));

/** @param {string} path @param {Record<string, any>} meta */
const post = (path, meta = {}) => /** @type {ProcessedPost} */ ({ path, meta });

describe('sitemap helpers', () => {
	test('parseDate devuelve undefined para fechas vacías o inválidas', () => {
		expect(parseDate(undefined)).toBeUndefined();
		expect(parseDate('')).toBeUndefined();
		expect(parseDate('no es fecha')).toBeUndefined();
		expect(parseDate('2024-01-02T00:00:00Z')?.toISOString()).toBe('2024-01-02T00:00:00.000Z');
	});

	test('sortByPublished ordena de más nuevo a más viejo, sin fecha al final', () => {
		const sorted = sortByPublished([
			post('/material/a', { published_date: '2023-01-01Z' }),
			post('/material/b'),
			post('/material/c', { published_date: '2024-01-01Z' })
		]);
		expect(sorted.map((p) => p.path)).toEqual(['/material/c', '/material/a', '/material/b']);
	});

	test('render incluye las entradas de la wiki, con lastmod sólo si tienen fecha', () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const xml = render(
			['/wiki'],
			[post('/material/a', { published_date: '2024-01-01T00:00:00Z' })],
			[post('/wiki/BDSM'), post('/wiki/bondage', { updated_date: '2023-11-04T00:00:00Z' })],
			now
		);
		expect(xml).toContain('<loc>https://kinkyvibe.ar/material/a</loc>');
		expect(xml).toMatch(
			/<loc>https:\/\/kinkyvibe\.ar\/wiki\/BDSM<\/loc>\s*<priority>0\.5<\/priority>\s*<\/url>/
		);
		expect(xml).toMatch(
			/<loc>https:\/\/kinkyvibe\.ar\/wiki\/bondage<\/loc>\s*<priority>0\.5<\/priority>\s*<lastmod>2023-11-04T00:00:00\.000Z<\/lastmod>/
		);
	});
});

describe('GET /sitemap.xml', () => {
	test('lista los posts y las entradas de la Kinkipedia', async () => {
		const res = await GET(/** @type {any} */ ({}));
		expect(res.headers.get('Content-Type')).toBe('application/xml');
		const xml = await res.text();
		expect(xml).toContain('<loc>https://kinkyvibe.ar/calendario</loc>');
		expect(xml).toContain('<loc>https://kinkyvibe.ar/wiki/BDSM</loc>');
		expect(xml).toContain('<loc>https://kinkyvibe.ar/calendario/fiesta</loc>');
		expect(xml).toContain('<loc>https://kinkyvibe.ar/material/sin-fecha</loc>');
		expect(xml).not.toContain('Invalid Date');
		expect(xml.match(/<url>/g)?.length).toBe(xml.match(/<\/url>/g)?.length);
	});
});

import { describe, expect, test, vi } from 'vitest';
import { parseDate, render, sortByPublished } from './sitemap.js';
import { GET } from './+server.js';

// Compilar los ~600 posts reales tardaba ~20 s. Acá alcanzan unos de muestra; el sitemap real
// (prerenderizado en el build) lo revisa tests/smoke.spec.js.
// Las publicaciones salen de la base (`sitePosts`) y las páginas de la wiki, de las etiquetas de la
// base (`siteWikiPosts`, «solo base»): acá, de mentira.
vi.mock('$lib/server/contenido/posts.js', () => ({
	sitePosts: async () => [
		{ path: '/calendario/fiesta', meta: { published_date: '2026-09-29Z-03:00' } },
		{ path: '/material/sin-fecha', meta: {} }
	]
}));
vi.mock('$lib/server/wiki/site.js', () => ({
	siteWikiPosts: async () => [{ path: '/wiki/BDSM', meta: {} }]
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
		const xml = render(
			['/wiki'],
			[post('/material/a', { published_date: '2024-01-01T00:00:00Z' })],
			[post('/wiki/BDSM'), post('/wiki/bondage', { updated_date: '2023-11-04T00:00:00Z' })]
		);
		expect(xml).toContain('<loc>https://kinkyvibe.ar/material/a</loc>');
		expect(xml).toMatch(/<loc>https:\/\/kinkyvibe\.ar\/wiki\/BDSM<\/loc>\s*<\/url>/);
		expect(xml).toMatch(
			/<loc>https:\/\/kinkyvibe\.ar\/wiki\/bondage<\/loc>\s*<lastmod>2023-11-04T00:00:00\.000Z<\/lastmod>/
		);
	});

	test('render no usa <priority> (Google la ignora)', () => {
		const xml = render(['/', '/material'], [post('/material/a')], [post('/wiki/BDSM')]);
		expect(xml).not.toContain('priority');
	});

	test('una publicación sin fecha va sin lastmod (nunca la hora del pedido)', () => {
		const xml = render([], [post('/material/sin-fecha')], []);
		expect(xml).toMatch(/<loc>https:\/\/kinkyvibe\.ar\/material\/sin-fecha<\/loc>\s*<\/url>/);
	});

	test('el lastmod de una sección es la fecha más nueva de lo que lista, y no cambia con la hora', async () => {
		vi.useFakeTimers();
		try {
			const pages = ['/', '/material', '/calendario', '/amigues', '/wiki'];
			const posts = [
				post('/material/vieja', { published_date: '2024-01-01T00:00:00Z' }),
				post('/material/nueva', {
					published_date: '2024-02-01T00:00:00Z',
					updated_date: '2025-03-04T00:00:00Z'
				}),
				// Las que redirigen no están en el sitemap: tampoco cuentan para la fecha.
				post('/material/en-la-tienda', { published_date: '2026-01-01T00:00:00Z', redirect: true }),
				post('/calendario/fiesta', { published_date: '2025-06-07T00:00:00Z' })
			];
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			const first = render(pages, posts, []);
			vi.setSystemTime(new Date('2026-05-05T12:00:00Z'));
			const second = render(pages, posts, []);
			expect(first).toBe(second);
			expect(first).toMatch(
				/<loc>https:\/\/kinkyvibe\.ar\/material<\/loc>\s*<lastmod>2025-03-04T00:00:00\.000Z<\/lastmod>/
			);
			expect(first).toMatch(
				/<loc>https:\/\/kinkyvibe\.ar\/calendario<\/loc>\s*<lastmod>2025-06-07T00:00:00\.000Z<\/lastmod>/
			);
			// Sin nada que listar, o sin ser la lista de una sección: sin lastmod.
			expect(first).toMatch(/<loc>https:\/\/kinkyvibe\.ar\/amigues<\/loc>\s*<\/url>/);
			expect(first).toMatch(/<loc>https:\/\/kinkyvibe\.ar\/<\/loc>\s*<\/url>/);
			expect(first).toMatch(/<loc>https:\/\/kinkyvibe\.ar\/wiki<\/loc>\s*<\/url>/);
		} finally {
			vi.useRealTimers();
		}
	});
});

test('render deja afuera las publicaciones que redirigen a otro sitio', () => {
	const xml = render(
		[],
		[
			post('/material/guia', {}),
			post('/material/en-la-tienda', { redirect: true, link: 'https://example.com/tienda' })
		],
		[]
	);
	expect(xml).toContain('<loc>https://kinkyvibe.ar/material/guia</loc>');
	expect(xml).not.toContain('en-la-tienda');
});

test('render deja afuera los perfiles que pidieron no aparecer en buscadores', () => {
	const xml = render(
		['/amigues'],
		[
			post('/amigues/Persona_Inventada', { published_date: '2025-01-01T00:00:00Z' }),
			post('/amigues/Sin_Buscadores', { noindex: true, published_date: '2026-02-02T00:00:00Z' })
		],
		[]
	);
	expect(xml).toContain('<loc>https://kinkyvibe.ar/amigues/Persona_Inventada</loc>');
	expect(xml).not.toContain('Sin_Buscadores');
	// Tampoco cuenta para la fecha de /amigues (no se nota cuándo lo editaron).
	expect(xml).not.toContain('2026-02-02');
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

	test('la raíz va una sola vez y /todo no está (va con noindex)', async () => {
		const xml = await (await GET(/** @type {any} */ ({}))).text();
		expect(xml.match(/<loc>https:\/\/kinkyvibe\.ar\/?<\/loc>/g)).toEqual([
			'<loc>https://kinkyvibe.ar/</loc>'
		]);
		expect(xml).not.toContain('/todo</loc>');
	});
});

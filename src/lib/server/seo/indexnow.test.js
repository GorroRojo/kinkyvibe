/**
 * IndexNow: apagado sin clave y fuera de producción, y nunca avisa algo que no esté en la lista
 * pública del sitemap (oculto, no listado, borrado, que redirige). D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { saveObject } from '$lib/server/objects/save.js';
import {
	INDEXNOW_ENDPOINT,
	INDEXNOW_MAX_URLS,
	INDEXNOW_WINDOW_MS,
	candidatePaths,
	indexNowUrls,
	isValidIndexNowKey,
	publicPaths,
	runIndexNow
} from './indexnow.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const KEY = 'clave-inventada-1234';
const ORIGIN = 'https://kinkyvibe.ar';

/** @param {string} path @param {Record<string, unknown>} [meta] @returns {ProcessedPost} */
const post = (path, meta = {}) => /** @type {any} */ ({ path, meta });

describe('las piezas', () => {
	it('clave: 8 a 128 letras, números o guiones', () => {
		expect(isValidIndexNowKey(KEY)).toBe(true);
		expect(isValidIndexNowKey('corta')).toBe(false);
		expect(isValidIndexNowKey('con espacio 123')).toBe(false);
		expect(isValidIndexNowKey(undefined)).toBe(false);
		expect(isValidIndexNowKey('a'.repeat(129))).toBe(false);
	});

	it('la lista pública: como el sitemap, sin lo que redirige', () => {
		const visible = publicPaths(
			[post('/material/nota'), post('/material/tienda', { redirect: 'https://example.com' })],
			[post('/wiki/bondage')]
		);
		expect([...visible].sort()).toEqual(['/material/nota', '/wiki/bondage']);
	});

	it('nunca un perfil que pidió no aparecer en buscadores (la misma regla que el sitemap)', () => {
		const visible = publicPaths(
			[post('/amigues/Persona_Inventada'), post('/amigues/Sin_Buscadores', { noindex: true })],
			[]
		);
		expect([...visible]).toEqual(['/amigues/Persona_Inventada']);
		expect(
			indexNowUrls(
				[
					{ type: 'perfil', slug: 'persona-inventada', legacy_slug: 'Persona_Inventada' },
					{ type: 'perfil', slug: 'sin-buscadores', legacy_slug: 'Sin_Buscadores' }
				],
				visible
			)
		).toEqual([ORIGIN + '/amigues/Persona_Inventada']);
	});

	it('candidatas por slug y slug viejo; solo se avisan las que están en la lista pública', () => {
		expect(candidatePaths({ type: 'evento', slug: 'nuevo', legacy_slug: 'viejo' })).toEqual([
			'/calendario/nuevo',
			'/calendario/viejo'
		]);
		expect(candidatePaths({ type: 'imagen', slug: 'foto' })).toEqual([]);
		const urls = indexNowUrls(
			[
				{ type: 'evento', slug: 'nuevo', legacy_slug: 'viejo' },
				{ type: 'material', slug: 'secreto' }
			],
			new Set(['/calendario/viejo'])
		);
		expect(urls).toEqual(['https://kinkyvibe.ar/calendario/viejo']);
	});

	it(`como mucho ${INDEXNOW_MAX_URLS} URLs`, () => {
		const rows = Array.from({ length: INDEXNOW_MAX_URLS + 5 }, (_, i) => ({
			type: 'material',
			slug: `n-${i}`
		}));
		const visible = new Set(rows.map((r) => `/material/${r.slug}`));
		expect(indexNowUrls(rows, visible)).toHaveLength(INDEXNOW_MAX_URLS);
	});
});

describe('runIndexNow con la base', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
	});
	afterAll(async () => {
		await t?.dispose();
	});
	beforeEach(async () => {
		await resetDB(t.db);
	});
	afterEach(() => {
		vi.doUnmock('$env/dynamic/private');
		vi.resetModules();
	});

	/**
	 * @param {'evento' | 'material'} type
	 * @param {string} slug
	 * @param {Record<string, unknown>} data
	 * @param {'public' | 'members' | 'hidden'} [visibility]
	 * @param {number} [now]
	 */
	const dbObject = (type, slug, data, visibility = 'public', now = NOW) =>
		saveObject(
			t.db,
			{ type, slug, title: `Inventado ${slug}`, visibility, data },
			{ actor: 'admin-inventade', now }
		);

	async function lists() {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({ env: {} }));
		const posts = await import('$lib/server/contenido/posts.js');
		posts.clearContentCache();
		const { siteWikiPosts } = await import('$lib/server/wiki/site.js');
		return {
			posts: await posts.sitePosts(t.platform),
			wikiPosts: await siteWikiPosts(t.platform)
		};
	}

	/** @param {Partial<Parameters<typeof runIndexNow>[0]>} [opts] */
	async function run(opts = {}) {
		const fetch = vi.fn(async () => new Response(null, { status: 202 }));
		const result = await runIndexNow({
			db: t.db,
			key: KEY,
			origin: ORIGIN,
			fetch: /** @type {any} */ (fetch),
			lists,
			now: NOW + 60_000,
			...opts
		});
		return { result, fetch };
	}

	const start = new Date(NOW + 10 * 24 * 60 * 60 * 1000).toISOString();

	it('avisa solo lo público y listado que cambió en la ventana', async () => {
		await dbObject('evento', 'evento-publico', { start });
		await dbObject('evento', 'evento-oculto', { start }, 'hidden');
		await dbObject('evento', 'evento-miembres', { start }, 'members');
		await dbObject('evento', 'evento-no-listado', { start, unlisted: true });
		await dbObject('material', 'nota-publica', { published_date: '2030-02-01' });
		await dbObject('material', 'nota-a-la-tienda', {
			published_date: '2030-02-01',
			link: 'https://tienda.example.com',
			redirect: true
		});
		// cambió antes de la ventana: no se repite
		await dbObject(
			'material',
			'nota-vieja',
			{ published_date: '2030-01-01' },
			'public',
			NOW - 2 * INDEXNOW_WINDOW_MS
		);

		const { result, fetch } = await run();
		expect(fetch).toHaveBeenCalledTimes(1);
		const [endpoint, init] = /** @type {any} */ (fetch.mock.calls[0]);
		expect(endpoint).toBe(INDEXNOW_ENDPOINT);
		const body = JSON.parse(init.body);
		expect(body).toMatchObject({
			host: 'kinkyvibe.ar',
			key: KEY,
			keyLocation: 'https://kinkyvibe.ar/indexnow-key.txt'
		});
		expect(body.urlList.sort()).toEqual([
			'https://kinkyvibe.ar/calendario/evento-publico',
			'https://kinkyvibe.ar/material/nota-publica'
		]);
		const sent = JSON.stringify(body);
		for (const secret of ['oculto', 'miembres', 'no-listado', 'tienda', 'nota-vieja']) {
			expect(sent).not.toContain(secret);
		}
		expect(result).toEqual({ sent: 2, status: 202 });
	});

	it('pasar algo a oculto no lo avisa', async () => {
		const saved = await dbObject('material', 'nota-que-se-oculta', {
			published_date: '2030-02-01'
		});
		await saveObject(
			t.db,
			{
				id: saved.id,
				version: saved.version,
				type: 'material',
				slug: 'nota-que-se-oculta',
				title: 'Inventado',
				visibility: 'hidden',
				data: { published_date: '2030-02-01' }
			},
			{ actor: 'admin-inventade', now: NOW + 1000 }
		);
		const { result, fetch } = await run();
		expect(fetch).not.toHaveBeenCalled();
		expect(result).toEqual({ sent: 0 });
	});

	it('apagado sin clave o fuera de producción (ni lee la base)', async () => {
		await dbObject('material', 'nota-publica', { published_date: '2030-02-01' });
		for (const opts of [
			{ key: undefined },
			{ key: 'corta' },
			{ origin: 'https://rama-kinkyvibe.example.workers.dev' },
			{ origin: 'http://localhost:5173' }
		]) {
			const listsSpy = vi.fn(lists);
			const { result, fetch } = await run({ ...opts, lists: listsSpy });
			expect(result).toHaveProperty('skipped');
			expect(fetch).not.toHaveBeenCalled();
			expect(listsSpy).not.toHaveBeenCalled();
		}
	});

	it('sin cambios no pide las listas ni avisa; si IndexNow falla, no tira', async () => {
		const listsSpy = vi.fn(lists);
		const quiet = await run({ lists: listsSpy });
		expect(quiet.result).toEqual({ sent: 0 });
		expect(listsSpy).not.toHaveBeenCalled();

		await dbObject('material', 'nota-publica', { published_date: '2030-02-01' });
		const failing = vi.fn(async () => {
			throw new Error('sin red');
		});
		const { result } = await run({ fetch: /** @type {any} */ (failing) });
		expect(result).toEqual({ sent: 0, error: 'sin red' });
		const rejected = vi.fn(async () => new Response(null, { status: 403 }));
		expect((await run({ fetch: /** @type {any} */ (rejected) })).result).toEqual({
			sent: 0,
			status: 403
		});
	});
});

describe('/indexnow-key.txt', () => {
	afterEach(() => {
		vi.doUnmock('$env/dynamic/private');
		vi.resetModules();
	});

	/** @param {Record<string, string | undefined>} env */
	async function get(env) {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({ env }));
		const { GET } = await import('../../../routes/indexnow-key.txt/+server.js');
		return GET(/** @type {any} */ ({}));
	}

	it('con clave, la clave en texto', async () => {
		const res = await get({ INDEXNOW_KEY: KEY });
		expect(res.headers.get('content-type')).toContain('text/plain');
		expect(await res.text()).toBe(KEY);
	});

	it('sin clave (o inválida), 404', async () => {
		for (const env of [{}, { INDEXNOW_KEY: 'corta' }]) {
			await expect(get(env)).rejects.toMatchObject({ status: 404 });
		}
	});
});

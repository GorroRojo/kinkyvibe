/**
 * Las listas armadas se guardan también en la caché de Cloudflare (`caches.default`) con la marca
 * del contenido como clave (./posts.js, `edgeState`): un isolate nuevo (acá, `vi.resetModules`)
 * con la misma marca no las vuelve a armar; con otra marca, sí. Sin `caches` (vitest, el build),
 * como siempre. Una caché de mentira en memoria; D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { countingDB, createTestDB, resetDB } from '$lib/server/db/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { seedPosts } from './testing.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

/** Una caché como la de Cloudflare, en memoria: guarda el texto de cada respuesta por URL. */
function fakeCache() {
	/** @type {Map<string, { body: string, headers: Headers }>} */
	const store = new Map();
	/** @type {string[]} */
	const puts = [];
	return {
		store,
		puts,
		/** @param {string} key */
		async match(key) {
			const hit = store.get(key);
			return hit ? new Response(hit.body, { headers: hit.headers }) : undefined;
		},
		/** @param {string} key @param {Response} res */
		async put(key, res) {
			puts.push(key);
			store.set(key, { body: await res.text(), headers: res.headers });
		}
	};
}

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});
beforeEach(async () => {
	fake.event = null;
	await resetDB(t.db);
	vi.resetModules();
	await seedPosts(t.db, [
		{
			category: 'calendario',
			postID: 'evento-inventado',
			title: 'Evento Inventado',
			summary: 'Un evento de prueba',
			start: '2099-01-10T20:00-03:00',
			published_date: '2026-09-01Z-03:00',
			tags: [],
			authors: []
		},
		{
			category: 'material',
			postID: 'material-inventado',
			title: 'Material Inventado',
			summary: 'Un material de prueba',
			published_date: '2026-08-01Z-03:00',
			tags: [],
			authors: [],
			force_unlisted: true
		}
	]);
	await makeProfile(t.db, { title: 'Perfil Inventado' });
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

/** Las consultas de la marca del contenido (./posts.js, `contentStamp`). */
const isStamp = (/** @type {{ sql: string }} */ l) => l.sql.includes('AS psu');

/**
 * Un isolate nuevo que atiende un GET: las listas (con y sin los no listados), las consultas que
 * hizo y el estado con que se armaron.
 */
async function isolate() {
	vi.resetModules();
	const counted = countingDB(t.db);
	const platform = { env: { ...t.env, DB: counted.db } };
	const posts = await import('./posts.js');
	fake.event = { request: new Request('https://example.com/', { method: 'GET' }) };
	const listed = await posts.sitePosts(platform);
	const unlisted = await posts.sitePosts(platform, false, true);
	const pronouns = await posts.siteProfilePronouns(platform);
	fake.event = null;
	return { listed, unlisted, pronouns, log: counted.log, posts };
}

describe('las listas en la caché de Cloudflare', () => {
	it('con la misma marca, otro isolate las lee de la caché: solo la consulta de la marca', async () => {
		const plain = await isolate(); // sin caché: lo que arma la base
		const cache = fakeCache();
		vi.stubGlobal('caches', { default: cache });
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});

		const first = await isolate();
		expect(cache.puts).toHaveLength(1);
		expect(log).toHaveBeenCalledWith(expect.stringMatching(/^contenido: listas armadas .* ms$/));
		// Lo guardado: solo las listas armadas y sus pistas (ni cuerpos ni pronombres).
		const saved = JSON.parse([...cache.store.values()][0].body);
		expect(Object.keys(saved).sort()).toEqual(['hints', 'listed', 'paths', 'profiles', 'unlisted']);
		expect([...cache.store.values()][0].headers.get('cache-control')).toBe('public, max-age=86400');
		expect(cache.puts[0]).toMatch(/^https:\/\/kinkyvibe\.ar\/__contenido\//);

		log.mockClear();
		const second = await isolate();
		expect(second.log.filter((l) => !isStamp(l))).toEqual([]);
		expect(second.log.filter(isStamp)).toHaveLength(1);
		expect(log).not.toHaveBeenCalled();
		expect(cache.puts).toHaveLength(1);
		// Lo mismo que sin caché.
		expect(second.listed).toEqual(plain.listed);
		expect(second.unlisted).toEqual(plain.unlisted);
		expect(second.listed).toEqual(first.listed);
		expect(second.listed.map((p) => p.meta.title)).toEqual([
			'Evento Inventado',
			'Perfil Inventado'
		]);
		expect(second.unlisted.map((p) => p.meta.title)).toEqual(['Material Inventado']);
		expect(second.pronouns).toEqual(plain.pronouns);
	});

	it('las direcciones vuelven como Map: el índice de la búsqueda lee los cuerpos', async () => {
		const plain = await isolate();
		const plainBodies = await plain.posts.siteBodies({ env: t.env });
		vi.stubGlobal('caches', { default: fakeCache() });
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await isolate();
		const second = await isolate();
		expect(await second.posts.siteBodies({ env: t.env })).toEqual(plainBodies);
	});

	it('con otra marca (cambió la base), no la encuentra y la vuelve a armar', async () => {
		const cache = fakeCache();
		vi.stubGlobal('caches', { default: cache });
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await isolate();
		await seedPosts(t.db, [
			{
				category: 'calendario',
				postID: 'otro-evento-inventado',
				title: 'Otro Evento Inventado',
				summary: 'Otro evento de prueba',
				start: '2099-02-10T20:00-03:00',
				published_date: '2026-09-02Z-03:00',
				tags: [],
				authors: []
			}
		]);
		const after = await isolate();
		expect(cache.puts).toHaveLength(2);
		expect(cache.puts[1]).not.toBe(cache.puts[0]);
		expect(after.log.filter((l) => !isStamp(l)).length).toBeGreaterThan(0);
		expect(after.listed.map((p) => p.meta.title)).toContain('Otro Evento Inventado');
	});

	it('sin `caches`, como siempre: cada isolate nuevo arma las listas', async () => {
		const first = await isolate();
		const second = await isolate();
		expect(second.log.filter((l) => !isStamp(l)).length).toBeGreaterThan(0);
		expect(second.listed).toEqual(first.listed);
	});

	it('una caché que falla no rompe las listas', async () => {
		vi.stubGlobal('caches', {
			default: {
				match: async () => {
					throw new Error('caída');
				},
				put: async () => {
					throw new Error('caída');
				}
			}
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		const plain = await isolate();
		expect(plain.listed.map((p) => p.meta.title)).toEqual(['Evento Inventado', 'Perfil Inventado']);
	});
});

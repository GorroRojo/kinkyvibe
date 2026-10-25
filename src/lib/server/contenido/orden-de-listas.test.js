/**
 * El orden de las listas (./posts.js): `mergePosts` lee la fecha de cada post una vez y da el
 * mismo orden que `comparePosts`; `sitePosts` ordena una vez por estado y devuelve una copia en
 * cada pedido. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDB } from '$lib/server/db/testing.js';
import { makeProfile } from '$lib/server/amigues/testing.js';
import { seedPosts } from './testing.js';
import { comparePosts, mergePosts } from './posts.js';

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
// Cuenta las fechas que se leen para ordenar (el resto de dates.js, tal cual).
const parses = vi.hoisted(() => ({ n: 0 }));
vi.mock('$lib/utils/dates.js', async (importOriginal) => {
	const real = /** @type {any} */ (await importOriginal());
	return {
		...real,
		parseSiteDate: (/** @type {any[]} */ ...args) => {
			parses.n += 1;
			return real.parseSiteDate(...args);
		}
	};
});

vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

/**
 * Un post mínimo para ordenar.
 * @param {string} path
 * @param {string} category
 * @param {Record<string, string | undefined>} dates
 */
const post = (path, category, dates) => /** @type {any} */ ({ path, meta: { category, ...dates } });

describe('mergePosts', () => {
	it('da el mismo orden que comparePosts: fechas, sin fecha, empates por categoría y dirección', () => {
		const profiles = [
			post('amigues/b', 'amigues', { updated_date: '2026-05-01Z-03:00' }),
			post('amigues/a', 'amigues', { updated_date: '2026-05-01Z-03:00' })
		];
		const fromDb = [
			post('calendario/sin-fecha', 'calendario', {}),
			post('calendario/x', 'calendario', { start: '2099-01-10T20:00-03:00' }),
			post('material/m', 'material', { published_date: '2026-05-01Z-03:00' }),
			post('calendario/y', 'calendario', { start: '2026-05-01T00:00-03:00' }),
			post('material/otra-sin-fecha', 'material', { published_date: 'no es una fecha' }),
			post('calendario/z', 'calendario', { start: '2099-01-10T20:00-03:00' })
		];
		const expected = [...profiles, ...fromDb].sort(comparePosts).map((p) => p.path);
		parses.n = 0;
		expect(mergePosts(profiles, [...fromDb]).map((p) => p.path)).toEqual(expected);
		// Una lectura por post, no una por comparación.
		expect(parses.n).toBe(profiles.length + fromDb.length);
		expect(mergePosts(profiles, [...fromDb].reverse()).map((p) => p.path)).toEqual(expected);
	});
});

describe('sitePosts', () => {
	/** @type {Awaited<ReturnType<typeof createTestDB>>} */
	let t;
	beforeAll(async () => {
		t = await createTestDB();
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
				authors: []
			}
		]);
		await makeProfile(t.db, { title: 'Perfil Inventado' });
	});
	afterAll(async () => {
		fake.event = null;
		await t?.dispose();
	});

	it('ordena una vez por estado y da una copia en cada pedido', async () => {
		vi.resetModules();
		const posts = await import('./posts.js');
		const platform = { env: t.env };
		const read = async () => {
			fake.event = { request: new Request('https://example.com/', { method: 'GET' }) };
			try {
				return await posts.sitePosts(platform);
			} finally {
				fake.event = null;
			}
		};
		const first = await read();
		const titles = first.map((p) => p.meta.title);
		const firstObjects = [...first];
		expect(titles).toEqual(['Evento Inventado', 'Material Inventado', 'Perfil Inventado']);
		// Quien recibe la lista la puede cambiar: el próximo pedido la recibe entera y en orden.
		first.reverse();
		first.pop();
		parses.n = 0;
		const second = await read();
		// Mismo estado: sin volver a ordenar (ni a leer fechas).
		expect(parses.n).toBe(0);
		expect(second).not.toBe(first);
		expect(second.map((p) => p.meta.title)).toEqual(titles);
		// Los mismos objetos (del estado recordado), sin volver a armarlos.
		second.forEach((p, i) => expect(p).toBe(firstObjects[i]));
	});
});

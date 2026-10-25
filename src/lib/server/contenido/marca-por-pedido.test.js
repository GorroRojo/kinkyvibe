/**
 * El «¿cambió algo?» de las listas recordadas (la marca de la base) se consulta una sola vez por
 * pedido de lectura, no una vez por cada llamada (la lista, los no listados, los pronombres, el
 * índice de la búsqueda). Y /amigues, sin sesión, recuerda su lista con esa marca: un pedido que
 * no cambia nada hace una sola consulta. D1 de miniflare; datos inventados.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** Un pedido nuevo con ese método. @param {string} method */
const newRequest = (method) => {
	fake.event = { request: new Request('https://example.com/', { method }) };
};

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
		}
	]);
	for (let i = 0; i < 4; i++) {
		await makeProfile(t.db, { title: `Perfil Inventado ${i}` });
	}
	await makeProfile(t.db, { title: 'Perfil Sin Aprobar', approved: false });
	await makeProfile(t.db, { title: 'Perfil Con Cuenta', visibility: 'members' });
});

/** Las consultas de la marca del contenido (./posts.js, `contentStamp`). */
const stamps = (/** @type {{ sql: string }[]} */ log) =>
	log.filter((l) => l.sql.includes('AS psu')).length;

describe('la marca del contenido, una vez por pedido', () => {
	/** @param {string} method */
	async function oneRequest(method) {
		const counted = countingDB(t.db);
		const platform = { env: { ...t.env, DB: counted.db } };
		const posts = await import('./posts.js');
		newRequest(method);
		await posts.sitePosts(platform);
		await posts.sitePosts(platform);
		await posts.sitePosts(platform, false, true);
		await posts.siteContentStamp(platform);
		await posts.siteProfilePronouns(platform);
		return { counted, platform, posts };
	}

	it('en un GET: una consulta de la marca para todas las llamadas', async () => {
		const { counted } = await oneRequest('GET');
		expect(stamps(counted.log)).toBe(1);
		// Otro pedido vuelve a mirar (y como no cambió nada, no arma nada de nuevo).
		const second = await oneRequest('GET');
		expect(second.counted.log.length).toBe(1);
		expect(stamps(second.counted.log)).toBe(1);
	});

	it('en un POST: una por llamada (un guardado del pedido se ve al toque)', async () => {
		const { counted } = await oneRequest('POST');
		expect(stamps(counted.log)).toBe(5);
	});

	it('fuera de un pedido, como antes: una por llamada', async () => {
		const counted = countingDB(t.db);
		const platform = { env: { ...t.env, DB: counted.db } };
		const posts = await import('./posts.js');
		await posts.sitePosts(platform);
		await posts.siteContentStamp(platform);
		expect(stamps(counted.log)).toBe(2);
	});
});

describe('/amigues sin sesión, recordada por la marca', () => {
	/**
	 * @param {any} locals lo de la sesión (`{}`: sin sesión)
	 * @param {import('@cloudflare/workers-types').D1Database} [db]
	 */
	async function amigues(locals, db = t.db) {
		const counted = countingDB(db);
		newRequest('GET');
		const { load } = await import('../../../routes/(content)/amigues/+page.server.js');
		const page = /** @type {any} */ (
			await load(
				/** @type {any} */ ({
					platform: { env: { ...t.env, DB: counted.db } },
					locals,
					setHeaders: () => {}
				})
			)
		);
		// Sentencias, no idas: con las tandas automáticas (../db/autoBatch.js) varias van en una.
		return { posts: /** @type {ProcessedPost[]} */ (page.posts), queries: counted.statements };
	}

	it('el segundo pedido hace una sola consulta y muestra lo mismo que sin recordar', async () => {
		const first = await amigues({});
		const second = await amigues({});
		expect(second.queries).toBe(1);
		expect(second.posts).toEqual(first.posts);
		// Lo mismo que arma la lista sin recordar nada.
		const { profilePosts } = await import('$lib/server/amigues/asPost.js');
		const { ANON } = await import('$lib/server/objects/visibility.js');
		expect(second.posts).toEqual(await profilePosts(t.db, ANON));
		expect(second.posts.map((p) => p.meta.title)).toEqual([
			'Perfil Inventado 0',
			'Perfil Inventado 1',
			'Perfil Inventado 2',
			'Perfil Inventado 3'
		]);
	});

	it('un cambio en los perfiles se ve en el pedido siguiente', async () => {
		await amigues({});
		const nuevo = await makeProfile(t.db, { title: 'Perfil Nuevo Inventado' });
		const after = await amigues({});
		expect(after.posts.map((p) => p.meta.title)).toContain('Perfil Nuevo Inventado');
		// Ocultarlo también.
		const { saveObject } = await import('$lib/server/objects/save.js');
		await saveObject(
			t.db,
			{ id: nuevo.id, type: 'perfil', version: nuevo.version, visibility: 'hidden' },
			{ actor: 'admin-de-prueba' }
		);
		const hidden = await amigues({});
		expect(hidden.posts.map((p) => p.meta.title)).not.toContain('Perfil Nuevo Inventado');
	});

	it('con sesión no se recuerda (una cuenta ve también lo «solo con cuenta»)', async () => {
		await amigues({});
		const member = { member: { id: 'cuenta-inventada', email: 'cuenta@example.com' } };
		const first = await amigues(/** @type {any} */ (member));
		const second = await amigues(/** @type {any} */ (member));
		expect(second.queries).toBe(first.queries);
		expect(second.queries).toBeGreaterThan(1);
		expect(second.posts.map((p) => p.meta.title)).toContain('Perfil Con Cuenta');
		const anon = await amigues({});
		expect(anon.posts.map((p) => p.meta.title)).not.toContain('Perfil Con Cuenta');
	});
});

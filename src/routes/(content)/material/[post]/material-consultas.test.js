/**
 * La página de un material hace sus consultas a la base en pocas tandas en fila: la base está
 * lejos (en el este de EE. UU.) y cada consulta que espera a la anterior es una ida y vuelta más.
 * La lista de publicaciones sale a la par del material, y "Más cosas de…" (con sus lugares y su
 * venta), los pronombres y las personas, a la par entre sí. Lo que no se puede ver sigue dando
 * 404 antes que cualquier otra cosa (también un material oculto que lleva a un link). D1 de
 * miniflare; datos inventados.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ADMINS } from '$lib/server/auth.js';
import { countingDB, createTestDB } from '$lib/server/db/testing.js';
import { seedPosts } from '$lib/server/contenido/testing.js';
import { makeAccount, makeProfile } from '$lib/server/amigues/testing.js';

// La primera prueba compila la ruta: tarda.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 120_000 });

// Como en un pedido de verdad (GET): lo que se lee una vez por pedido se comparte.
const fake = vi.hoisted(() => ({ event: /** @type {any} */ (null) }));
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!fake.event) throw new Error('fuera de un pedido');
		return fake.event;
	}
}));

/** Cada consulta tarda esto de más, para contar bien lo que sale a la par. */
const DELAY_MS = 15;
const ADMIN = { id: ADMINS[0].id, login: ADMINS[0].login };

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
/** @type {{ id: string, email: string }} */
let member;

/** @param {string} postID @param {Record<string, unknown>} [extra] */
const materialMeta = (postID, extra = {}) => ({
	category: 'material',
	postID,
	title: `Guía ${postID}`,
	summary: 'Un material de prueba',
	published_date: '2026-09-01Z-03:00',
	tags: [],
	authors: ['autore-inventade', 'otre-inventade'],
	...extra
});

beforeAll(async () => {
	t = await createTestDB();
	await makeProfile(t.db, { title: 'Autore Inventade', slug: 'autore-inventade' });
	await makeProfile(t.db, { title: 'Otre Inventade', slug: 'otre-inventade' });
	member = await makeAccount(t.db, 'cuenta-inventada');
	await seedPosts(t.db, [
		{
			...materialMeta('guia-inventada', {
				personas: [{ perfil: 'otre-inventade', rol: 'Traductore' }]
			}),
			body: 'Texto inventado, con una mención a @autore-inventade.'
		},
		materialMeta('otra-guia-inventada'),
		materialMeta('guia-oculta-inventada', { title: 'Guía Secreta', force_unpublished: true }),
		materialMeta('guia-no-listada-inventada', { force_unlisted: true }),
		materialMeta('guia-solo-cuentas-inventada', { title: 'Guía Para Cuentas' }),
		materialMeta('link-inventado', { redirect: true, link: 'https://example.com/inventado' }),
		materialMeta('link-oculto-inventado', {
			redirect: true,
			link: 'https://example.com/secreto',
			force_unpublished: true
		}),
		// "Más cosas de…": un evento de les mismes autores, con venta.
		{
			category: 'calendario',
			postID: 'taller-inventado',
			title: 'Taller Inventado',
			summary: 'Un evento de prueba',
			published_date: '2026-09-01Z-03:00',
			start: '2099-03-06T20:00-03:00',
			status: 'abierto',
			modalidad: 'presencial',
			location: 'Calle Inventada 123',
			tags: ['KinkyVibe'],
			authors: ['autore-inventade'],
			payment_methods: ['transferencia'],
			tickets: [{ id: 'general', name: 'General', price: 10000, capacity: 50 }]
		}
	]);
	await t.db
		.prepare(`UPDATE objects SET visibility = 'members', version = version + 1 WHERE slug = ?1`)
		.bind('guia-solo-cuentas-inventada')
		.run();
});
afterAll(async () => {
	fake.event = null;
	await t?.dispose();
});

/**
 * La página de `slug` cargada en frío (sin nada recordado de otro pedido) o en caliente (un pedido
 * antes en el mismo isolate), con una base que cuenta las consultas y las tandas en fila. Un 404 o
 * una redirección salen como el error que tiró.
 * @param {string} slug
 * @param {{ as?: 'anon' | 'member' | 'admin', warm?: boolean }} [opts]
 */
async function materialPage(slug, { as = 'anon', warm = false } = {}) {
	vi.resetModules();
	const counted = countingDB(t.db, { delayMs: DELAY_MS });
	const platform = { env: { ...t.env, DB: counted.db } };
	// Como hooks.server.js: el contenido se lee con la base de `getDB` (con sus tandas).
	(await import('$lib/server/contenido/repo.js')).setContentDB(
		(await import('$lib/server/db')).getDB(platform)
	);
	const url = new URL(`/material/${slug}`, 'https://kinkyvibe.ar');
	fake.event = { request: new Request(url), url, cookies: { get: () => undefined } };
	// Como cada pedido: hooks.server.js lee el árbol de etiquetas al empezar.
	await (await import('$lib/server/etiquetas/source.js')).siteTagSource(platform);
	const { load } = await import('./+page.server.js');
	/** @type {Record<string, string>} */
	const headers = {};
	const locals =
		as === 'admin'
			? { user: ADMIN, user_token: 'tok' }
			: as === 'member'
				? { user: undefined, user_token: '', member }
				: { user: undefined, user_token: '' };
	const event = /** @type {any} */ ({
		url,
		params: { post: slug },
		platform,
		locals,
		setHeaders: (/** @type {Record<string, string>} */ h) => Object.assign(headers, h)
	});
	// En caliente: un pedido antes en el mismo isolate (lo que se recuerda entre pedidos).
	if (warm) {
		await Promise.resolve(load(event)).catch(() => {});
		fake.event = { request: new Request(url), url, cookies: { get: () => undefined } };
		for (const k of Object.keys(headers)) delete headers[k];
	}
	counted.reset();
	try {
		const page = /** @type {any} */ (await load(event));
		return { page, headers, queries: counted.queries, waves: counted.waves };
	} catch (e) {
		// Un 404 o una redirección: con lo que consultó hasta ahí.
		if (e && typeof e === 'object')
			Object.assign(e, { queries: counted.queries, waves: counted.waves });
		throw e;
	} finally {
		fake.event = null;
	}
}

describe('la página de un material, en pocas tandas', () => {
	it('con autores, personas, menciones y "Más cosas de…" con venta', async () => {
		const r = await materialPage('guia-inventada');
		expect(r.page.meta.title).toBe('Guía guia-inventada');
		expect(r.page.authorsProfiles.map((/** @type {any} */ a) => a.meta.postID)).toEqual([
			'autore-inventade',
			'otre-inventade'
		]);
		expect(r.page.relatedPosts.map((/** @type {any} */ p) => p.meta.postID).sort()).toEqual([
			'link-inventado',
			'otra-guia-inventada',
			'taller-inventado'
		]);
		expect(r.page.ticketStates).toMatchObject({ 'taller-inventado': expect.any(Object) });
		expect(r.page.personas).toContainEqual(
			expect.objectContaining({
				rol: 'Traductore',
				items: [expect.objectContaining({ slug: 'otre-inventade' })]
			})
		);
		expect(r.headers).toEqual({});
		// En caliente: un pedido antes en el mismo isolate (lo que se recuerda entre pedidos).
		const warm = await materialPage('guia-inventada', { warm: true });
		expect(warm.page.relatedPosts).toEqual(r.page.relatedPosts);
		if (process.env.KV_CONSULTAS) {
			console.info(
				`[material] frío: ${r.queries} consultas en ${r.waves} tandas; caliente: ${warm.queries} en ${warm.waves}`
			);
		}
		// En caliente y sin sesión, una sola ida (con solo las tandas automáticas: 4 en 4).
		expect(warm.queries).toBe(1);
		expect(warm.waves).toBe(1);
		// Antes: 16 consultas en 14 tandas en frío; 11 en 9 en caliente.
		expect(r.queries).toBeLessThanOrEqual(14);
		expect(r.waves).toBeLessThanOrEqual(6);
		expect(warm.queries).toBeLessThanOrEqual(9);
		expect(warm.waves).toBeLessThanOrEqual(4);
	});

	it('un material oculto: 404 para quien no es admin; admin lo ve, sin caché compartida', async () => {
		await expect(materialPage('guia-oculta-inventada')).rejects.toMatchObject({ status: 404 });
		await expect(materialPage('guia-oculta-inventada', { as: 'member' })).rejects.toMatchObject({
			status: 404
		});
		const r = await materialPage('guia-oculta-inventada', { as: 'admin' });
		expect(r.page.meta.title).toBe('Guía Secreta');
		expect(r.headers).toEqual({ 'cache-control': 'private, no-store' });
	});

	it('un material solo para cuentas: 404 sin sesión, se ve con cuenta', async () => {
		await expect(materialPage('guia-solo-cuentas-inventada')).rejects.toMatchObject({
			status: 404
		});
		const r = await materialPage('guia-solo-cuentas-inventada', { as: 'member' });
		expect(r.page.meta.title).toBe('Guía Para Cuentas');
	});

	it('un material no listado se ve con el link', async () => {
		const r = await materialPage('guia-no-listada-inventada');
		expect(r.page.meta.postID).toBe('guia-no-listada-inventada');
		expect(r.headers).toEqual({});
	});

	it('un material que lleva a un link redirige; si está oculto, 404 (no dice adónde)', async () => {
		await expect(materialPage('link-inventado')).rejects.toMatchObject({
			status: 307,
			location: 'https://example.com/inventado'
		});
		await expect(materialPage('link-oculto-inventado')).rejects.toMatchObject({ status: 404 });
		await expect(materialPage('link-oculto-inventado', { as: 'admin' })).rejects.toMatchObject({
			status: 307,
			location: 'https://example.com/secreto'
		});
	});

	it('un material que lleva a un link redirige apenas leído el material', async () => {
		/** @type {any} */
		let thrown;
		try {
			await materialPage('link-inventado');
		} catch (e) {
			thrown = e;
		}
		expect(thrown).toMatchObject({ status: 307, location: 'https://example.com/inventado' });
		if (process.env.KV_CONSULTAS) {
			console.info(`[material] redirige: ${thrown.queries} consultas en ${thrown.waves} tandas`);
		}
		// Antes: el material entero (relaciones, portada, autores y texto) antes de redirigir: 7
		// consultas en 3 tandas. Ahora, el material y, a la par, la marca de la lista de
		// publicaciones (la lista empieza a leerse pero nadie la espera).
		expect(thrown.queries).toBeLessThanOrEqual(2);
		expect(thrown.waves).toBeLessThanOrEqual(2);
	});

	it('un material que no existe sigue dando 404', async () => {
		await expect(materialPage('no-existe-inventado')).rejects.toMatchObject({ status: 404 });
	});
});

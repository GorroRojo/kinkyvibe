/**
 * Rutas de propinas: /propinas (form action), /propinas/<id>/gracias, el pie de las
 * publicaciones (el bloque de propina) y el webhook de MP (firma y estados). El interruptor
 * `propinas` quedó prendido para siempre: se fueron los casos «apagado» (404, la nota del
 * cafecito) y el dato `propinas` del layout raíz. D1 de miniflare, MP simulado con `fetch`;
 * datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { signWebhook } from '$lib/server/tickets/mercadopago.js';
import TipBlock from '$lib/components/propinas/TipBlock.svelte';
import { isKinkyVibePost } from '$lib/utils/propinas.js';
import { formatARS } from '$lib/utils/money.js';
import { runImport } from '$lib/server/contenido/importer.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

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
	vi.doUnmock('$lib/utils');
	vi.doUnmock('$lib/server/pronouns');
	vi.resetModules();
});

const SECRET = 'secreto-webhook-de-prueba';

/** Publicaciones de material con y sin la etiqueta KinkyVibe (las que haya en el repo). */
const rawPosts = /** @type {Record<string, string>} */ (
	import.meta.glob('/src/lib/posts/material/*.md', {
		query: '?raw',
		import: 'default',
		eager: true
	})
);
/** La metadata de cada publicación (se compila solo la que se pide). */
const metaLoaders = /** @type {Record<string, () => Promise<Record<string, any>>>} */ (
	import.meta.glob('/src/lib/posts/material/*.md', { import: 'metadata' })
);

/** Las dos publicaciones de la prueba, en la base (de donde sale el material). */
async function seedMaterial() {
	const files = [];
	for (const kv of [true, false]) {
		const slug = materialSlug(kv);
		const path = `/src/lib/posts/material/${slug}.md`;
		files.push({ legacySlug: slug, raw: rawPosts[path], meta: await metaLoaders[path]() });
	}
	const r = await runImport(t.db, 'material', files, { actor: 'prueba' });
	expect(r.results.filter((x) => x.action === 'error')).toEqual([]);
}

/** @param {boolean} kv */
function materialSlug(kv) {
	for (const [path, raw] of Object.entries(rawPosts)) {
		const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? '';
		if (slug.startsWith('_') || /force_unpublished:\s*true/.test(raw)) continue;
		if (/^\s*-\s*KinkyVibe\b/m.test(raw) === kv) return slug;
	}
	throw new Error('no hay publicaciones para la prueba');
}

/** Módulos con MP configurado (con `fetch` simulado). */
async function modules() {
	vi.resetModules();
	await seedMaterial();
	vi.doMock('$env/dynamic/private', () => ({
		env: { MP_ACCESS_TOKEN: 'TEST-token', MP_WEBHOOK_SECRET: SECRET }
	}));
	// El load de /material/<post> también arma las relacionadas y los pronombres de las menciones,
	// que importan (y compilan con mdsvex) todas las publicaciones del repo: más de 15 s la primera
	// vez, y con la máquina cargada pasaba los 30 s del test. Acá solo importa `propinas`, así que
	// esas dos listas van vacías; la publicación misma sale de la base (`seedMaterial`).
	vi.doMock('$lib/utils', async (importOriginal) => ({
		.../** @type {object} */ (await importOriginal()),
		fetchMarkdownPosts: async () => []
	}));
	vi.doMock('$lib/server/pronouns', () => ({ mentionPronouns: async () => ({}) }));
	return {
		page: await import('./+page.server.js'),
		gracias: await import('./[id]/gracias/+page.server.js'),
		material: await import('../material/[post]/+page.server.js'),
		webhook: await import('../../api/mercadopago/webhook/+server.js'),
		propinas: await import('$lib/server/propinas/index.js'),
		posts: await import('$lib/server/propinas/posts.js')
	};
}

/**
 * Evento de SvelteKit de mentira. `mp` responde las llamadas a la API de MP.
 * @param {{ path?: string, params?: Record<string, string>, form?: Record<string, string>, mp?: (url: string, init?: RequestInit) => unknown, headers?: Record<string, string>, body?: string }} [o]
 */
function fakeEvent({ path = '/propinas', params = {}, form, mp, headers, body } = {}) {
	const url = new URL(path, 'https://kinkyvibe.ar');
	const fetchFn = vi.fn(async (/** @type {any} */ u, /** @type {any} */ init) =>
		Response.json(mp ? mp(String(u), init) : {})
	);
	/** @type {any} */
	const event = {
		url,
		params,
		platform: t.platform,
		locals: {},
		setHeaders: () => {},
		getClientAddress: () => '203.0.113.7',
		fetch: fetchFn,
		request: new Request(url, {
			method: form || body ? 'POST' : 'GET',
			headers,
			body: form ? new URLSearchParams(form) : body
		})
	};
	return event;
}

/**
 * Lo que tira (error o redirect de SvelteKit) una función, o `null` si no tira.
 * @param {() => unknown} fn
 * @returns {Promise<any>}
 */
async function thrown(fn) {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
}

describe('propinas', () => {
	it('el pie de una publicación de Kinky Vibe es el bloque de propina (y no la nota)', async () => {
		const m = await modules();
		const slug = materialSlug(true);
		const data = /** @type {any} */ (await m.material.load(fakeEvent({ params: { post: slug } })));
		// La página pone el bloque solo en las publicaciones de KinkyVibe.
		expect(isKinkyVibePost(data.meta)).toBe(true);
		const { body } = render(TipBlock, { props: { category: 'material', slug } });
		expect(body).toContain('Dejá una propina');
		expect(body).toContain('action="/propinas"');
		expect(body).toContain(formatARS(1000));
		expect(body).toContain('Otro monto');
		expect(body).not.toContain('cafecito.app');
		// No se elige a dónde va: la propina va al Fondo Kinky Vibe y el bloque lo dice.
		expect(body).not.toContain('name="destination"');
		expect(body).not.toContain('Para Kinky Vibe');
		expect(body).toMatch(
			/Tu propina va entera\s+al\s+<a href="https:\/\/fondo\.kinkyvibe\.ar"[^>]*>Fondo Kinky Vibe<\/a>/
		);
		// Una publicación que no es de KinkyVibe no lleva el bloque.
		const other = /** @type {any} */ (
			await m.material.load(fakeEvent({ params: { post: materialSlug(false) } }))
		);
		expect(isKinkyVibePost(other.meta)).toBe(false);
	});

	it('findTipPost: solo publicaciones de Kinky Vibe que existen', async () => {
		const m = await modules();
		expect(await m.posts.findTipPost('material', materialSlug(true), t.platform)).toMatchObject({
			title: expect.any(String)
		});
		expect(await m.posts.findTipPost('material', materialSlug(false), t.platform)).toBeNull();
		expect(
			await m.posts.findTipPost('material', 'no-existe-esta-publicacion', t.platform)
		).toBeNull();
	});

	it('form action: valida, crea la preferencia y redirige a MP; con errores, 400', async () => {
		const m = await modules();
		const slug = materialSlug(true);
		const bad = /** @type {any} */ (
			await m.page.actions.default(
				fakeEvent({ form: { amount: 'otro', custom: '10', category: 'material', slug } })
			)
		);
		expect(bad.status).toBe(400);
		expect(bad.data.errors.amount).toBe(`El mínimo es ${formatARS(500)}.`);

		const mp = () => ({ id: 'pref-1', init_point: 'https://www.mercadopago.com.ar/checkout?x=1' });
		const ok = await thrown(() =>
			m.page.actions.default(
				fakeEvent({ form: { amount: '5000', message: 'Hola', category: 'material', slug }, mp })
			)
		);
		expect(ok).toMatchObject({
			status: 303,
			location: 'https://www.mercadopago.com.ar/checkout?x=1'
		});
		const row = /** @type {any} */ (await t.db.prepare('SELECT * FROM tips').first());
		expect(row).toMatchObject({
			amount: 5000,
			status: 'pending',
			message: 'Hola',
			destination: 'fondo'
		});

		// Un formulario viejo que manda "kinkyvibe" o un destino raro: igual va al Fondo.
		await thrown(() =>
			m.page.actions.default(
				fakeEvent({
					form: { amount: '1000', destination: 'kinkyvibe', category: 'material', slug },
					mp
				})
			)
		);
		const fondo = /** @type {any} */ (
			await t.db.prepare('SELECT * FROM tips WHERE amount = 1000').first()
		);
		expect(fondo).toMatchObject({ status: 'pending', destination: 'fondo' });
		await thrown(() =>
			m.page.actions.default(
				fakeEvent({ form: { amount: '1500', destination: 'nope', category: 'material', slug }, mp })
			)
		);
		const odd = /** @type {any} */ (
			await t.db.prepare('SELECT * FROM tips WHERE amount = 1500').first()
		);
		expect(odd).toMatchObject({ status: 'pending', destination: 'fondo' });
		expect((await t.db.prepare('SELECT COUNT(*) AS n FROM tips').first())?.n).toBe(3);
	});

	it('webhook: con firma válida aprueba y después reembolsa; sin firma, 401 y nada cambia', async () => {
		const m = await modules();
		const tip = await m.propinas.createTip(t.db, {
			amount: 2000,
			message: null,
			category: 'material',
			slug: 'guia',
			destination: 'fondo'
		});
		let mpStatus = 'approved';
		const mp = (/** @type {string} */ u) => {
			expect(u).toBe('https://api.mercadopago.com/v1/payments/777');
			return {
				id: 777,
				status: mpStatus,
				external_reference: `propina:${tip.id}`,
				transaction_amount: 2000,
				currency_id: 'ARS'
			};
		};
		const path = '/api/mercadopago/webhook?data.id=777&type=payment';
		const body = JSON.stringify({ type: 'payment', data: { id: '777' } });

		// Sin firma o con una firma de otro secreto: 401, la propina sigue pendiente.
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const unsigned = await m.webhook.POST(fakeEvent({ path, body, mp }));
		expect(unsigned.status).toBe(401);
		const forged = await m.webhook.POST(
			fakeEvent({
				path,
				body,
				mp,
				headers: {
					'x-request-id': 'r1',
					'x-signature': await signWebhook({ dataId: '777', requestId: 'r1', secret: 'otro' })
				}
			})
		);
		expect(forged.status).toBe(401);
		spy.mockRestore();
		expect((await m.propinas.getTip(t.db, tip.id))?.status).toBe('pending');

		/** @param {string} requestId */
		const signed = async (requestId) =>
			fakeEvent({
				path,
				body,
				mp,
				headers: {
					'x-request-id': requestId,
					'x-signature': await signWebhook({ dataId: '777', requestId, secret: SECRET })
				}
			});
		const res = await m.webhook.POST(await signed('r2'));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, outcome: 'updated' });
		expect((await m.propinas.getTip(t.db, tip.id))?.status).toBe('approved');
		// El webhook no toca el destino: aprobada, cuenta como aporte al Fondo.
		expect((await m.propinas.getTip(t.db, tip.id))?.destination).toBe('fondo');
		expect(await m.propinas.fondoTipTotals(t.db)).toEqual({ count: 1, total: 2000 });

		mpStatus = 'refunded';
		await m.webhook.POST(await signed('r3'));
		expect((await m.propinas.getTip(t.db, tip.id))?.status).toBe('refunded');
		expect((await m.propinas.getTip(t.db, tip.id))?.destination).toBe('fondo');
		// Reembolsada ya no suma.
		expect(await m.propinas.fondoTipTotals(t.db)).toEqual({ count: 0, total: 0 });
	});

	it('gracias: muestra el estado de la base y arma el link de vuelta del lado del servidor', async () => {
		const m = await modules();
		const tip = await m.propinas.createTip(t.db, {
			amount: 1000,
			message: 'privado',
			category: 'calendario',
			slug: 'fiesta-de-prueba'
		});
		// MP todavía sin pago para esa referencia: sigue pendiente.
		const mp = () => ({ results: [] });
		const data = /** @type {any} */ (
			await m.gracias.load(fakeEvent({ params: { id: tip.id }, mp }))
		);
		expect(data).toEqual({
			tip: { amount: 1000, status: 'pending', destination: 'fondo' },
			postPath: '/calendario/fiesta-de-prueba'
		});
		// El mensaje no se muestra en la página pública.
		expect(JSON.stringify(data)).not.toContain('privado');
		const missing = await thrown(() =>
			m.gracias.load(fakeEvent({ params: { id: 'no-existe' }, mp }))
		);
		expect(missing?.status).toBe(404);
	});
});

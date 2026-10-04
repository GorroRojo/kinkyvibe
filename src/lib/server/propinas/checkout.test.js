/**
 * Crear una propina: validación del lado del servidor, preferencia de MP (con la API de MP
 * simulada por `fetch`, como en las pruebas de las entradas), límite por cliente y redirecciones.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { createPreference } from '$lib/server/tickets/mercadopago.js';
import { isSafeCheckoutUrl, readTipForm, startTip } from './checkout.js';
import { TIP_RATE_LIMITS, getTip } from './index.js';

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

const ORIGIN = 'https://kv.test';
const NOW = Date.parse('2026-10-01T15:00:00Z');
const findPost = vi.fn(async () => ({ title: 'Guía de prueba' }));

/**
 * Gateway con el cliente REAL de MP (createPreference) y un `fetch` simulado.
 * @param {string} [initPoint]
 */
function mpGateway(initPoint = 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=x') {
	const fetch = vi.fn(
		async () => new Response(JSON.stringify({ id: 'pref-1', init_point: initPoint }))
	);
	const client = { fetch, accessToken: 'TEST-token-de-prueba' };
	const gateway = /** @type {import('$lib/server/tickets/index.js').Gateway} */ (
		/** @type {unknown} */ ({
			mock: false,
			createPreference: (/** @type {any} */ p, /** @type {string} */ k) =>
				createPreference(client, p, k)
		})
	);
	return { fetch, gateway };
}

/** @param {Record<string, string>} [o] */
function values(o = {}) {
	return { amount: '2000', custom: '', message: '', category: 'material', slug: 'guia', ...o };
}

/** @param {Partial<Parameters<typeof startTip>[0]>} o */
function run(o) {
	return startTip({
		db: t.db,
		gateway: mpGateway().gateway,
		values: values(),
		client: 'cliente-a',
		origin: ORIGIN,
		findPost,
		now: NOW,
		...o
	});
}

/** @returns {Promise<any[]>} */
async function allTips() {
	return (await t.db.prepare('SELECT * FROM tips').all()).results;
}

describe('startTip', () => {
	it('crea la propina pendiente y la preferencia en MP con el monto del servidor', async () => {
		const { fetch, gateway } = mpGateway();
		const res = await run({ gateway, values: values({ message: '  ¡Gracias!  ' }) });
		expect(res).toMatchObject({ ok: true });
		if (!res.ok) throw new Error('esperaba ok');
		expect(res.checkoutUrl).toMatch(/^https:\/\/www\.mercadopago\.com\.ar\//);
		const tip = await getTip(t.db, res.tipId);
		expect(tip).toMatchObject({
			amount: 2000,
			status: 'pending',
			post_category: 'material',
			post_slug: 'guia',
			message: '¡Gracias!',
			mp_preference_id: 'pref-1'
		});
		const [url, init] = /** @type {any} */ (fetch.mock.calls[0]);
		expect(url).toBe('https://api.mercadopago.com/checkout/preferences');
		expect(init.headers.Authorization).toBe('Bearer TEST-token-de-prueba');
		expect(init.headers['X-Idempotency-Key']).toBe(res.tipId);
		const body = JSON.parse(init.body);
		expect(body.external_reference).toBe(`propina:${res.tipId}`);
		expect(body.items[0].unit_price).toBe(2000);
		expect(body).not.toHaveProperty('payer');
		expect(findPost).toHaveBeenCalledWith('material', 'guia');
	});

	it('"otro monto" se valida en el servidor: fuera de rango no crea nada', async () => {
		for (const custom of ['499', '500001', '-5', 'mil']) {
			const res = await run({ values: values({ amount: 'otro', custom }), client: custom });
			expect(res).toMatchObject({ ok: false, status: 400, errors: { amount: expect.any(String) } });
		}
		// El navegador no puede mandar un monto que no sea un número válido aunque edite el form.
		const res = await run({ values: values({ amount: '1' }) });
		expect(res).toMatchObject({ ok: false, status: 400 });
		expect(await allTips()).toEqual([]);
		const ok = await run({ values: values({ amount: 'otro', custom: '$ 1.500' }), client: 'b' });
		expect(ok.ok).toBe(true);
		expect((await allTips())[0].amount).toBe(1500);
	});

	it('destino: toda propina va al Fondo, mande lo que mande el formulario', async () => {
		const { fetch, gateway } = mpGateway();
		const plain = await run({ gateway, values: values() });
		if (!plain.ok) throw new Error('esperaba ok');
		expect((await getTip(t.db, plain.tipId))?.destination).toBe('fondo');
		const body = JSON.parse(/** @type {any} */ (fetch.mock.calls[0])[1].body);
		expect(body.items[0].title).toBe('Propina para el Fondo Kinky Vibe · Guía de prueba');

		// Un formulario viejo (o armado) que pide "Para Kinky Vibe" o algo raro: igual al Fondo.
		const values2 = /** @type {any} */ ({ ...values(), destination: 'kinkyvibe' });
		const old = await run({ values: values2, client: 'b' });
		if (!old.ok) throw new Error('esperaba ok');
		expect((await getTip(t.db, old.tipId))?.destination).toBe('fondo');
		const values3 = /** @type {any} */ ({ ...values(), destination: 'mi-bolsillo' });
		const odd = await run({ values: values3, client: 'c' });
		if (!odd.ok) throw new Error('esperaba ok');
		expect((await getTip(t.db, odd.tipId))?.destination).toBe('fondo');
		expect(await allTips()).toHaveLength(3);
	});

	it('publicación inexistente o que no es de KinkyVibe: 400', async () => {
		const res = await run({ findPost: async () => null });
		expect(res).toMatchObject({ ok: false, status: 400, errors: { post: expect.any(String) } });
		expect(await allTips()).toEqual([]);
	});

	it('sin Mercado Pago configurado: 503 y nada guardado', async () => {
		expect(await run({ gateway: null })).toMatchObject({ ok: false, status: 503 });
		expect(await allTips()).toEqual([]);
	});

	it('si MP falla o devuelve un link a otra web: 502 y la propina se descarta', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failing = /** @type {any} */ ({
			createPreference: async () => {
				throw new Error('MP caído');
			}
		});
		expect(await run({ gateway: failing })).toMatchObject({ ok: false, status: 502 });
		const evil = mpGateway('https://mercadopago.com.ar.otra-web.test/robar');
		expect(await run({ gateway: evil.gateway, client: 'b' })).toMatchObject({
			ok: false,
			status: 502
		});
		spy.mockRestore();
		expect(await allTips()).toEqual([]);
	});

	it(`límite por cliente: ${TIP_RATE_LIMITS.client.limit} intentos por ventana (válidos o no)`, async () => {
		const { limit } = TIP_RATE_LIMITS.client;
		for (let i = 0; i < limit; i++) {
			const res = await run({ values: values({ amount: i % 2 ? '2000' : 'nada' }) });
			expect(res.ok ? 200 : res.status).not.toBe(429);
		}
		expect(await run({})).toMatchObject({ ok: false, status: 429 });
		// Otro cliente no queda bloqueado.
		expect((await run({ client: 'cliente-b' })).ok).toBe(true);
		// Pasada la ventana, se puede de nuevo.
		const later = NOW + TIP_RATE_LIMITS.client.windowSeconds * 1000;
		expect((await run({ now: later })).ok).toBe(true);
	});
});

describe('isSafeCheckoutUrl (sin redirecciones abiertas)', () => {
	it('solo Mercado Pago por https o una ruta de este sitio', () => {
		expect(
			isSafeCheckoutUrl('https://www.mercadopago.com.ar/checkout/v1/redirect?x=1', ORIGIN)
		).toBe(true);
		expect(isSafeCheckoutUrl('https://sandbox.mercadopago.com.ar/x', ORIGIN)).toBe(true);
		expect(isSafeCheckoutUrl('https://mercadopago.com/x', ORIGIN)).toBe(true);
		expect(isSafeCheckoutUrl(`${ORIGIN}/propinas/simular-pago/x`, ORIGIN)).toBe(true);
		expect(isSafeCheckoutUrl('/propinas/simular-pago/x', ORIGIN)).toBe(true);
		expect(isSafeCheckoutUrl('http://www.mercadopago.com.ar/x', ORIGIN)).toBe(false);
		expect(isSafeCheckoutUrl('https://mercadopago.com.ar.evil.test/x', ORIGIN)).toBe(false);
		expect(isSafeCheckoutUrl('https://evilmercadopago.com/x', ORIGIN)).toBe(false);
		expect(isSafeCheckoutUrl('//evil.test/x', ORIGIN)).toBe(false);
		expect(isSafeCheckoutUrl('javascript:alert(1)', ORIGIN)).toBe(false);
		expect(isSafeCheckoutUrl('https://user:pw@www.mercadopago.com.ar/x', ORIGIN)).toBe(false);
		expect(isSafeCheckoutUrl('', ORIGIN)).toBe(false);
		expect(isSafeCheckoutUrl(undefined, ORIGIN)).toBe(false);
	});
});

describe('readTipForm', () => {
	it('lee todo como texto acotado', () => {
		const form = new FormData();
		form.set('amount', 'otro');
		form.set('custom', '3000');
		form.set('message', 'x'.repeat(5000));
		form.set('slug', 'guia');
		const v = readTipForm(form);
		expect(v).toMatchObject({ amount: 'otro', custom: '3000', category: '', slug: 'guia' });
		expect(v.message.length).toBe(600);
		// Ya no se elige a dónde va: `destination` no se lee aunque llegue.
		form.set('destination', 'kinkyvibe');
		expect(readTipForm(form)).not.toHaveProperty('destination');
	});
});

/**
 * GET /api/fondo/cotizacion (docs/propinas.md, «PayPal: cotización, ajuste y retiros»): secreto,
 * interruptor, `fecha`, el último día guardado antes, `stale`, 503 sin cotización o con la base
 * caída, y la forma de la respuesta. D1 de miniflare; datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { storeRate } from '$lib/server/paypal/rates.js';
import { setAdjustment } from '$lib/server/paypal/index.js';
import { handleCotizacion } from '$lib/server/fondo/cotizacion.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'fondo-secreto-de-prueba-0123456789';
// Lunes 2/11/2026, 12:00 de Argentina.
const NOW = Date.parse('2026-11-02T15:00:00Z');
const FETCHED = Date.parse('2026-10-30T21:15:00Z');

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
	vi.restoreAllMocks();
});

/** @param {Record<string, string>} [env] */
async function endpoint(env = { FONDO_MAIL_SECRET: SECRET, PAYPAL_ENABLED: '1' }) {
	vi.resetModules();
	vi.doMock('$env/dynamic/private', () => ({ env }));
	return await import('./+server.js');
}

/**
 * @param {string} query
 * @param {Record<string, string>} [headers]
 * @param {any} [platform]
 */
function event(query, headers = { 'x-fondo-secret': SECRET }, platform = t.platform) {
	const url = new URL(`/api/fondo/cotizacion${query}`, 'https://kinkyvibe.ar');
	return /** @type {any} */ ({ url, request: new Request(url, { headers }), platform });
}

/**
 * El handler con un `now` fijo.
 * @param {string} query
 * @param {{ db?: any, enabled?: boolean, headers?: Record<string, string> }} [o]
 */
function call(query, { db = t.db, enabled = true, headers = { 'x-fondo-secret': SECRET } } = {}) {
	const url = new URL(`https://kinkyvibe.ar/api/fondo/cotizacion${query}`);
	return handleCotizacion({
		request: new Request(url, { headers }),
		url,
		secret: SECRET,
		db,
		enabled,
		now: NOW
	});
}

async function seedRates() {
	await storeRate(t.db, {
		day: '2026-10-29',
		compra: 1550,
		venta: 1560,
		source: 'argentinadatos',
		fetchedAt: FETCHED
	});
	await storeRate(t.db, {
		day: '2026-10-30',
		compra: 1557.8,
		venta: 1568.8,
		source: 'dolarapi',
		fetchedAt: FETCHED
	});
}

describe('GET /api/fondo/cotizacion', () => {
	it('401 sin secreto, con uno incorrecto o sin FONDO_MAIL_SECRET configurado; sin detalle', async () => {
		const { GET } = await endpoint();
		for (const headers of /** @type {Record<string, string>[]} */ ([
			{},
			{ 'x-fondo-secret': 'otro-secreto-cualquiera-0000' },
			{ 'x-fondo-secret': '' }
		])) {
			const res = await GET(event('', headers));
			expect(res.status).toBe(401);
			expect(await res.text()).toBe('');
			expect(res.headers.get('cache-control')).toBe('no-store');
		}
		const unset = await endpoint({ PAYPAL_ENABLED: '1' });
		expect((await unset.GET(event(''))).status).toBe(401);
		// El secreto va antes que el interruptor y que `fecha`.
		const off = await endpoint({ FONDO_MAIL_SECRET: SECRET, PAYPAL_ENABLED: '0' });
		expect((await off.GET(event('?fecha=nada', {}))).status).toBe(401);
	});

	it('404 sin cuerpo con el interruptor `paypal` apagado (también sin fila en la base)', async () => {
		await seedRates();
		for (const env of /** @type {Record<string, string>[]} */ ([
			{ FONDO_MAIL_SECRET: SECRET, PAYPAL_ENABLED: '0' },
			{ FONDO_MAIL_SECRET: SECRET }
		])) {
			const { GET } = await endpoint(env);
			const res = await GET(event(''));
			expect(res.status).toBe(404);
			expect(await res.text()).toBe('');
		}
	});

	it('400 con una `fecha` que no es un día de verdad', async () => {
		const { GET } = await endpoint();
		for (const q of [
			'?fecha=',
			'?fecha=2026-02-30',
			'?fecha=2026-11-2',
			'?fecha=02/11/2026',
			'?fecha=hoy'
		]) {
			const res = await GET(event(q));
			expect(res.status, q).toBe(400);
			expect(await res.text()).toBe('');
		}
	});

	it('503 sin cotización guardada, sin base o con la base caída', async () => {
		expect((await call('')).status).toBe(503);
		const { GET } = await endpoint();
		expect((await GET(event('', undefined, {}))).status).toBe(503);
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => {
				throw new Error('D1 caída');
			}
		});
		const res = await call('', { db: broken });
		expect(res.status).toBe(503);
		expect(await res.text()).toBe('');
		// Una fecha anterior a todo lo guardado: tampoco hay cotización.
		await seedRates();
		expect((await call('?fecha=2026-10-01')).status).toBe(503);
	});

	it('la de `fecha`, o la del último día guardado antes; `stale` si le lleva más de un día', async () => {
		await seedRates();
		await setAdjustment(t.db, -4, { by: 'admin-de-prueba' });
		const exact = await call('?fecha=2026-10-29');
		expect(exact.status).toBe(200);
		expect(exact.headers.get('cache-control')).toBe('private, max-age=300');
		expect(await exact.json()).toEqual({
			base: 1550,
			adjustmentPct: -4,
			rate: 1488,
			date: '2026-10-29',
			stale: false,
			updatedAt: '2026-10-30T21:15:00.000Z'
		});
		// Sábado 31: la del viernes 30, al día.
		expect(await (await call('?fecha=2026-10-31')).json()).toMatchObject({
			base: 1557.8,
			rate: 1495.49,
			date: '2026-10-30',
			stale: false
		});
		// Sin fecha = hoy (lunes 2/11): la del viernes ya es vieja.
		expect(await (await call('')).json()).toMatchObject({ date: '2026-10-30', stale: true });
	});

	it('por la ruta, con el interruptor prendido: solo esos campos', async () => {
		await seedRates();
		const { GET } = await endpoint();
		const res = await GET(event('?fecha=2026-10-30'));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(Object.keys(body).sort()).toEqual(
			['adjustmentPct', 'base', 'date', 'rate', 'stale', 'updatedAt'].sort()
		);
		expect(body).toMatchObject({ base: 1557.8, adjustmentPct: 0, rate: 1557.8 });
	});
});

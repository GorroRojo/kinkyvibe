/**
 * GET /api/fondo/propinas-total (docs/propinas.md, «Total para el Fondo»): secreto, `mes`, los
 * bordes del mes Fondo (del 5 a las 00:00 de Argentina al 5 siguiente, exclusive), solo aprobadas
 * al Fondo, reembolsadas afuera, 503 si falla la base y la forma de la respuesta. D1 de miniflare;
 * datos inventados.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { applyTipPayment, createTip, tipReference } from '$lib/server/propinas/index.js';
import { fondoMonthRange, handlePropinasTotal } from '$lib/server/fondo/propinasTotal.js';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const SECRET = 'fondo-secreto-de-prueba-0123456789';
const NOW = Date.parse('2026-10-11T12:00:00Z');

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
async function endpoint(env = { FONDO_MAIL_SECRET: SECRET }) {
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
	const url = new URL(`/api/fondo/propinas-total${query}`, 'https://kinkyvibe.ar');
	return /** @type {any} */ ({ url, request: new Request(url, { headers }), platform });
}

let paymentId = 100;
/**
 * Una propina aprobada en `approvedAt` (y opcionalmente reembolsada después).
 * @param {{ amount: number, approvedAt: number, destination?: 'fondo' | 'kinkyvibe', source?: 'post' | 'fondo', status?: 'approved' | 'refunded' | 'rejected' | 'pending' }} o
 */
async function tip({
	amount,
	approvedAt,
	destination = 'fondo',
	source = 'post',
	status = 'approved'
}) {
	const created = await createTip(
		t.db,
		{
			amount,
			message: 'mensaje privado de prueba',
			category: 'material',
			slug: 'guia-de-prueba',
			destination,
			source
		},
		{ now: approvedAt - 60_000 }
	);
	if (status === 'pending') return created;
	const id = ++paymentId;
	/** @param {string} s @param {number} now */
	const pay = (s, now) =>
		applyTipPayment(
			t.db,
			{
				id,
				status: s,
				external_reference: tipReference(created.id),
				transaction_amount: amount,
				currency_id: 'ARS'
			},
			{ now }
		);
	if (status === 'rejected') {
		await pay('rejected', approvedAt);
		return created;
	}
	await pay('approved', approvedAt);
	if (status === 'refunded') await pay('refunded', approvedAt + 1000);
	return created;
}

describe('fondoMonthRange', () => {
	it('del 5 a las 00:00 de Argentina al 5 del mes siguiente (exclusive)', () => {
		expect(fondoMonthRange('2026-10')).toEqual({
			from: Date.parse('2026-10-05T03:00:00Z'),
			to: Date.parse('2026-11-05T03:00:00Z')
		});
		// Diciembre termina en enero del año siguiente.
		expect(fondoMonthRange('2026-12')).toEqual({
			from: Date.parse('2026-12-05T03:00:00Z'),
			to: Date.parse('2027-01-05T03:00:00Z')
		});
		expect(fondoMonthRange('2027-01')?.from).toBe(Date.parse('2027-01-05T03:00:00Z'));
	});

	it('otra forma: null', () => {
		for (const mes of [
			'',
			'2026-13',
			'2026-00',
			'2026-1',
			'26-10',
			'2026-10-05',
			'2026/10',
			' 2026-10',
			'2026-10 '
		]) {
			expect(fondoMonthRange(mes), mes).toBeNull();
		}
	});
});

describe('GET /api/fondo/propinas-total', () => {
	it('401 sin secreto, con uno incorrecto o sin FONDO_MAIL_SECRET configurado; sin detalle', async () => {
		const { GET } = await endpoint();
		for (const headers of /** @type {Record<string, string>[]} */ ([
			{},
			{ 'x-fondo-secret': 'otro-secreto-cualquiera-0000' },
			{ 'x-fondo-secret': '' }
		])) {
			const res = await GET(event('?mes=2026-10', headers));
			expect(res.status).toBe(401);
			expect(await res.text()).toBe('');
			expect(res.headers.get('cache-control')).toBe('no-store');
		}
		const unset = await endpoint({});
		expect((await unset.GET(event('?mes=2026-10'))).status).toBe(401);
		// El secreto se chequea antes que `mes`.
		expect((await GET(event('?mes=nada', {}))).status).toBe(401);
	});

	it('400 con un `mes` mal formado o sin `mes`', async () => {
		const { GET } = await endpoint();
		for (const q of [
			'',
			'?mes=',
			'?mes=2026-13',
			'?mes=2026-1',
			'?mes=octubre',
			'?mes=2026-10-01'
		]) {
			const res = await GET(event(q));
			expect(res.status, q).toBe(400);
			expect(await res.text()).toBe('');
		}
	});

	it('bordes del mes Fondo: el 5 a las 03:00Z entra; un ms antes, al mes anterior; el 5 siguiente, afuera', async () => {
		const start = Date.parse('2026-10-05T03:00:00Z');
		const end = Date.parse('2026-11-05T03:00:00Z');
		await tip({ amount: 1000, approvedAt: start }); // entra (inclusive)
		await tip({ amount: 2000, approvedAt: start - 1 }); // 4/10 23:59:59.999 ART: septiembre
		await tip({ amount: 4000, approvedAt: end - 1 }); // 4/11 23:59:59.999 ART: entra
		await tip({ amount: 8000, approvedAt: end }); // 5/11 00:00 ART: noviembre
		const { GET } = await endpoint();
		const oct = await (await GET(event('?mes=2026-10'))).json();
		expect(oct).toMatchObject({ total: 5000, count: 2, month: '2026-10' });
		const sep = await (await GET(event('?mes=2026-09'))).json();
		expect(sep).toMatchObject({ total: 2000, count: 1, month: '2026-09' });
		const nov = await (await GET(event('?mes=2026-11'))).json();
		expect(nov).toMatchObject({ total: 8000, count: 1, month: '2026-11' });
	});

	it('solo aprobadas y al Fondo, de publicaciones y desde el Fondo; las reembolsadas no cuentan', async () => {
		const at = Date.parse('2026-10-20T15:00:00Z');
		await tip({ amount: 1000, approvedAt: at }); // publicación, al Fondo
		await tip({ amount: 3000, approvedAt: at, source: 'fondo' }); // «Una vez» desde el Fondo
		await tip({ amount: 500, approvedAt: at, destination: 'kinkyvibe' }); // vieja, no suma
		await tip({ amount: 7000, approvedAt: at, status: 'refunded' }); // reembolsada
		await tip({ amount: 600, approvedAt: at, status: 'rejected' });
		await tip({ amount: 700, approvedAt: at, status: 'pending' });
		const { GET } = await endpoint();
		const res = await GET(event('?mes=2026-10'));
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ total: 4000, count: 2 });
	});

	it('forma de la respuesta: solo { total, count, month, updatedAt }, caché privado', async () => {
		await tip({ amount: 1500, approvedAt: Date.parse('2026-10-06T00:00:00Z') });
		const res = await handlePropinasTotal({
			request: new Request('https://kinkyvibe.ar/', { headers: { 'x-fondo-secret': SECRET } }),
			url: new URL('https://kinkyvibe.ar/api/fondo/propinas-total?mes=2026-10'),
			secret: SECRET,
			db: t.db,
			now: NOW
		});
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('private, max-age=300');
		expect(res.headers.get('content-type')).toMatch(/^application\/json/);
		const text = await res.text();
		expect(JSON.parse(text)).toEqual({
			total: 1500,
			count: 1,
			month: '2026-10',
			updatedAt: '2026-10-11T12:00:00.000Z'
		});
		// Nada de la persona ni del pago.
		expect(text).not.toContain('mensaje privado');
		expect(text).not.toMatch(/payment|mp_|guia-de-prueba/);
		// Un mes sin propinas: ceros.
		const { GET } = await endpoint();
		expect(await (await GET(event('?mes=2025-01'))).json()).toMatchObject({
			total: 0,
			count: 0,
			month: '2025-01'
		});
	});

	it('503 sin detalle si la base falla o no está', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const broken = /** @type {any} */ ({
			prepare: () => {
				throw new Error('D1 caída');
			}
		});
		const res = await handlePropinasTotal({
			request: new Request('https://kinkyvibe.ar/', { headers: { 'x-fondo-secret': SECRET } }),
			url: new URL('https://kinkyvibe.ar/api/fondo/propinas-total?mes=2026-10'),
			secret: SECRET,
			db: broken
		});
		expect(res.status).toBe(503);
		expect(await res.text()).toBe('');
		expect(res.headers.get('cache-control')).toBe('no-store');
		spy.mockRestore();
		const { GET } = await endpoint();
		expect((await GET(event('?mes=2026-10', undefined, {}))).status).toBe(503);
	});
});

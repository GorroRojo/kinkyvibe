import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { parseTicketConfig } from './config.js';
import { createManualOrder, manualOrderLimits } from './manual.js';
import { getCounts, reserveOrder } from './orders.js';

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

const EVENT = 'fiesta-de-prueba';
const NOW = Date.parse('2026-10-01T12:00:00Z');

/** @param {Record<string, any>} [meta] */
function config(meta = {}) {
	return /** @type {import('./config.js').EventTickets} */ (
		parseTicketConfig({
			title: 'Fiesta',
			start: '2026-10-10T21:00-03:00',
			tickets: [
				{ id: 'general', name: 'General', price: 8000, capacity: 2 },
				{ id: 'anticipada', name: 'Anticipada', price: 6000, capacity: 5, close: '2026-09-01' },
				{ id: 'gorra', name: 'A la gorra', a_la_gorra: { minimo: 1000, sugerido: 3000 } }
			],
			...meta
		})
	);
}
/** @param {string} id @param {Record<string, any>} [meta] */
const typeOf = (id, meta) => /** @type {any} */ (config(meta).types.find((x) => x.id === id));

/** @param {Partial<Parameters<typeof createManualOrder>[1]>} [o] */
function create(o = {}) {
	const quantity = o.quantity ?? 1;
	return createManualOrder(t.db, {
		eventSlug: EVENT,
		type: typeOf('general'),
		quantity,
		holders: Array.from({ length: quantity }, (_, i) => ({
			name: `Persona ${i + 1}`,
			pronouns: ''
		})),
		buyer: { name: 'Persona 1', email: '' },
		method: 'cortesia',
		amount: 0,
		by: 'admin-de-prueba',
		now: NOW,
		...o
	});
}

describe('manualOrderLimits', () => {
	it('dentro del cupo y con la venta abierta: nada', async () => {
		const c = config();
		expect(
			await manualOrderLimits(t.db, {
				eventSlug: EVENT,
				config: c,
				type: typeOf('general'),
				quantity: 2,
				now: NOW
			})
		).toEqual([]);
	});

	it('"todavía no abrió" no es un límite; el cierre del tipo y del evento sí', async () => {
		const early = config({ tickets_open: '2026-10-05T12:00-03:00' });
		expect(
			await manualOrderLimits(t.db, {
				eventSlug: EVENT,
				config: early,
				type: typeOf('general'),
				quantity: 1,
				now: NOW
			})
		).toEqual([]);
		expect(
			await manualOrderLimits(t.db, {
				eventSlug: EVENT,
				config: config(),
				type: typeOf('anticipada'),
				quantity: 1,
				now: NOW
			})
		).toEqual([{ kind: 'closed', reason: 'type_closed', typeName: 'Anticipada' }]);
		const after = Date.parse('2026-10-11T12:00:00Z');
		const limits = await manualOrderLimits(t.db, {
			eventSlug: EVENT,
			config: config({ status: 'agotadas' }),
			type: typeOf('general'),
			quantity: 1,
			now: after
		});
		expect(limits).toEqual([{ kind: 'closed', reason: 'soldout' }]);
	});

	it('cupo con las reservas vigentes y máximo por compra', async () => {
		await reserveOrder(t.db, {
			eventSlug: EVENT,
			type: typeOf('general'),
			quantity: 1,
			holders: [{ name: 'Online', pronouns: '' }],
			buyer: { name: 'Online', email: 'online@example.com', dni: '30000000' },
			now: NOW
		});
		const limits = await manualOrderLimits(t.db, {
			eventSlug: EVENT,
			config: config(),
			type: typeOf('general'),
			quantity: 21,
			now: NOW
		});
		expect(limits).toEqual([
			{ kind: 'max_per_purchase', max: 20, quantity: 21, over: 1 },
			{
				kind: 'capacity',
				type: 'general',
				typeName: 'General',
				capacity: 2,
				before: 1,
				after: 22,
				over: 20
			}
		]);
	});
});

describe('createManualOrder', () => {
	it('respeta el cupo sin override y lo pasa con override', async () => {
		expect((await create({ quantity: 2 })).ok).toBe(true);
		expect(await create()).toEqual({ ok: false, reason: 'soldout', available: 0 });
		const r = await create({ override: true, method: 'efectivo', amount: 5000 });
		expect(r.ok && r.order).toMatchObject({
			channel: 'manual',
			payment_method: 'efectivo',
			total: 5000,
			unit_price: 5000,
			status: 'approved'
		});
		expect((await getCounts(t.db, EVENT, NOW)).get('general')?.sold).toBe(3);
	});

	it('cortesía siempre sin cargo; monto 0 con otro medio también queda "gratis"; a la gorra', async () => {
		const c = await create({ method: 'cortesia', amount: 9999 });
		expect(c.ok && c.order).toMatchObject({ payment_method: 'gratis', total: 0 });
		const zero = await create({ method: 'transferencia', amount: 0 });
		expect(zero.ok && zero.order).toMatchObject({ payment_method: 'gratis', total: 0 });
		const g = await create({ type: typeOf('gorra'), method: 'otro', amount: 500, quantity: 2 });
		// El mínimo de la gorra es para la compra pública: a mano, el monto que diga le admin.
		expect(g.ok && g.order).toMatchObject({
			payment_method: 'otro',
			total: 1000,
			fondo_option: 'gorra'
		});
		await expect(create({ method: 'efectivo', amount: -1 })).rejects.toThrow(/Monto/);
		await expect(create({ method: /** @type {any} */ ('mercadopago') })).rejects.toThrow(/Medio/);
	});
});

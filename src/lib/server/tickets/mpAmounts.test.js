/**
 * Comisión real de Mercado Pago y reembolsos parciales hechos desde MP (migración 0065): lo que
 * guarda el aviso de MP y cómo cambian «Recaudado» y lo neto. Solo reportes: el estado de la
 * orden y lo que pasa con quien compra no cambian. Montos inventados y redondos.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import {
	applyPayment,
	getCounts,
	getOrder,
	getOrderTickets,
	paymentAmounts,
	reserveOrder
} from './orders.js';
import { goalProgress, netEstimate, orderMpFee, orderRevenue } from '$lib/utils/salesGoal.js';
import { monthMoney } from '$lib/server/admin/inicio.js';
import { formatARS } from '$lib/utils/money.js';

/** @type {Awaited<ReturnType<typeof createTestDB>>} */
let t;
beforeAll(async () => {
	t = await createTestDB();
});
afterAll(async () => {
	await t?.dispose();
});

const EVENT = 'fiesta-de-prueba';
const GENERAL = { id: 'general', price: 10000, capacity: 50 };
const NOW = Date.parse('2026-10-01T12:00:00Z');

beforeEach(async () => {
	await resetDB(t.db);
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
});

/**
 * Una orden de MP de `quantity` entradas de $ 10.000 (sin recargo con tasa 0).
 * @param {number} [quantity]
 * @param {number} [feeBasisPoints] la tasa del recargo de MP (300 = 3 %)
 */
async function reserve(quantity = 1, feeBasisPoints = 0) {
	const r = await reserveOrder(t.db, {
		eventSlug: EVENT,
		type: GENERAL,
		quantity,
		holders: Array.from({ length: quantity }, (_, i) => ({ name: `Persona ${i + 1}` })),
		buyer: { name: 'Persona de Prueba', email: 'prueba@example.com', dni: '30000000' },
		now: NOW,
		feeBasisPoints
	});
	return /** @type {any} */ (r).order;
}

/**
 * @param {string} orderId
 * @param {number} amount
 * @param {Partial<import('./orders.js').MPPayment>} [o]
 */
const payment = (orderId, amount, o = {}) => ({
	id: 555,
	status: 'approved',
	external_reference: orderId,
	transaction_amount: amount,
	currency_id: 'ARS',
	...o
});

describe('paymentAmounts', () => {
	it('suma solo las comisiones que paga la cuenta (collector), en pesos', () => {
		expect(
			paymentAmounts(
				payment('x', 10000, {
					fee_details: [
						{ type: 'financing_fee', fee_payer: 'payer', amount: 2130 },
						{ type: 'mercadopago_fee', fee_payer: 'collector', amount: 410.6 }
					],
					transaction_amount_refunded: 0
				})
			)
		).toEqual({ fee: 411, refunded: 0 });
	});

	it('sin `fee_details` (o con montos raros) la comisión no se sabe: null', () => {
		expect(paymentAmounts(payment('x', 10000))).toEqual({ fee: null, refunded: null });
		expect(
			paymentAmounts(
				payment('x', 10000, {
					fee_details: [{ type: 'mercadopago_fee', fee_payer: 'collector', amount: -1 }]
				})
			).fee
		).toBeNull();
		// Un pago sin comisiones para la cuenta: 0 (sabido), no null.
		expect(paymentAmounts(payment('x', 10000, { fee_details: [] })).fee).toBe(0);
	});
});

describe('comisión real de MP', () => {
	it('se guarda al aprobar y se usa para lo neto; sin ella, lo neto es estimado', async () => {
		const withFee = await reserve(1);
		await applyPayment(
			t.db,
			payment(withFee.id, 10000, {
				id: 1,
				fee_details: [{ type: 'mercadopago_fee', fee_payer: 'collector', amount: 700 }]
			})
		);
		expect((await getOrder(t.db, withFee.id))?.mp_fee_amount).toBe(700);

		const counts = (await getCounts(t.db, EVENT, NOW)).get('general');
		expect(counts).toMatchObject({ revenue: 10000, mpFee: 700, mpFeeEstimated: 0 });
		expect(netEstimate(/** @type {any} */ (counts))).toBeNull();
		expect(goalProgress('plata:20000', /** @type {any} */ (counts))?.text).toBe(
			`${formatARS(9300)} netos de ${formatARS(20000)} (47 %)`
		);

		// Otra orden, con recargo del 3 % ($ 10.310) y sin comisión informada: su comisión es la
		// estimada (el recargo, $ 310).
		const noFee = await reserve(1, 300);
		expect(noFee.surcharge_amount).toBe(310);
		await applyPayment(t.db, payment(noFee.id, 10310, { id: 2 }));
		expect((await getOrder(t.db, noFee.id))?.mp_fee_amount).toBeNull();
		const mixed = /** @type {any} */ ((await getCounts(t.db, EVENT, NOW)).get('general'));
		expect(mixed).toMatchObject({ revenue: 20310, mpFee: 1010, mpFeeEstimated: 310 });
		expect(netEstimate(mixed)).toBe('part');
		const progress = goalProgress('plata:20000', mixed);
		expect(progress?.text).toBe(
			`${formatARS(19300)} netos estimados de ${formatARS(20000)} (97 %)`
		);
		expect(progress?.estimateText).toContain(`${formatARS(310)} de los ${formatARS(1010)}`);
	});

	it('orderMpFee usa la comisión informada y, si no hay, el recargo', () => {
		const base = { payment_method: 'mercadopago', surcharge_amount: 300 };
		expect(orderMpFee({ ...base, mp_fee_amount: 450 })).toBe(450);
		expect(orderMpFee({ ...base, mp_fee_amount: null })).toBe(300);
		expect(orderMpFee({ payment_method: 'transferencia', surcharge_amount: 0 })).toBe(0);
		expect(netEstimate({ mpFee: 300, mpFeeEstimated: 300 })).toBe('all');
		expect(
			goalProgress('plata:10000', { sold: 1, revenue: 10000, mpFee: 300, mpFeeEstimated: 300 })
				?.text
		).toBe(`${formatARS(9700)} netos estimados de ${formatARS(10000)} (97 %)`);
	});

	it('un pago duplicado (otro id) no le pisa la comisión a la orden', async () => {
		const o = await reserve(1);
		const fee = (/** @type {number} */ amount) => [
			{ type: 'mercadopago_fee', fee_payer: 'collector', amount }
		];
		await applyPayment(t.db, payment(o.id, 10000, { id: 1, fee_details: fee(700) }));
		const dup = await applyPayment(t.db, payment(o.id, 10000, { id: 2, fee_details: fee(999) }));
		expect(dup.outcome).toBe('flagged');
		expect((await getOrder(t.db, o.id))?.mp_fee_amount).toBe(700);
	});
});

describe('reembolso parcial hecho desde MP', () => {
	it('se anota en la orden (sigue aprobada, con sus entradas) y se resta de lo recaudado', async () => {
		const o = await reserve(2);
		await applyPayment(t.db, payment(o.id, 20000));
		const partial = await applyPayment(
			t.db,
			payment(o.id, 20000, { transaction_amount_refunded: 10000 })
		);
		// Para quien compra no cambia nada: ni el estado, ni las entradas, ni un aviso nuevo.
		expect(partial).toMatchObject({ outcome: 'unchanged', newlyApproved: false });
		const order = await getOrder(t.db, o.id);
		expect(order).toMatchObject({ status: 'approved', refunded_amount: 10000 });
		expect(await getOrderTickets(t.db, o.id)).toHaveLength(2);
		expect(orderRevenue(/** @type {any} */ (order))).toBe(10000);

		expect((await getCounts(t.db, EVENT, NOW)).get('general')).toMatchObject({
			sold: 2,
			revenue: 10000
		});
		// «Entradas este mes» del Inicio (la orden no tiene evento en la base: cuenta su compra).
		expect(await monthMoney(t.db, NOW)).toMatchObject({ total: 10000, orders: 1, tickets: 2 });

		// El mismo aviso otra vez: idempotente.
		await applyPayment(t.db, payment(o.id, 20000, { transaction_amount_refunded: 10000 }));
		expect((await getOrder(t.db, o.id))?.refunded_amount).toBe(10000);
		// Un segundo reembolso parcial: MP manda el acumulado.
		await applyPayment(t.db, payment(o.id, 20000, { transaction_amount_refunded: 15000 }));
		expect((await getCounts(t.db, EVENT, NOW)).get('general')?.revenue).toBe(5000);
	});

	it('un reembolso total sigue como siempre: la orden pasa a reembolsada y no suma nada', async () => {
		const o = await reserve(1);
		await applyPayment(t.db, payment(o.id, 10000));
		const refunded = await applyPayment(
			t.db,
			payment(o.id, 10000, { status: 'refunded', transaction_amount_refunded: 10000 })
		);
		expect(refunded).toMatchObject({ outcome: 'updated' });
		const order = await getOrder(t.db, o.id);
		expect(order).toMatchObject({ status: 'refunded', refunded_amount: null });
		expect((await getCounts(t.db, EVENT, NOW)).get('general')).toMatchObject({
			sold: 0,
			revenue: 0
		});
		expect(await monthMoney(t.db, NOW)).toMatchObject({ total: 0, orders: 0 });
	});
});

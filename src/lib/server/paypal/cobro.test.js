/**
 * El cobro con PayPal contra la base (docs/paypal.md): propinas y órdenes de entradas, con el
 * PayPal simulado (mock.js). Idempotencia (la vuelta, el re-chequeo y el webhook aplican lo mismo),
 * montos que no coinciden y reembolso desde el panel.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDB, resetDB } from '$lib/server/db/testing.js';
import { createTip, getTip } from '$lib/server/propinas/index.js';
import {
	applyPaypalTipPayment,
	cancelPaypalTip,
	paypalTipCustomId,
	setTipPaypalCharge,
	setTipPaypalOrder
} from '$lib/server/propinas/paypal.js';
import {
	applyPayment,
	cancelPaypalOrder,
	getOrder,
	getOrderTickets,
	reserveOrder,
	setPaypalCharge,
	setPaypalOrder
} from '$lib/server/tickets/orders.js';
import { refundAllBatch, refundAllPreview, refundFromPanel } from '$lib/server/admin/refunds.js';
import { paypalSurcharge } from '$lib/utils/paypal.js';
import { MP_FEE_SQL } from '$lib/utils/salesGoal.js';
import { decideMockPaypalOrder, mockPaypalGateway as gw } from './mock.js';
import {
	PAYPAL_ORDER_PREFIX,
	buildPaypalOrder,
	settlePaypalOrder,
	usdCentsForArs
} from './payments.js';

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

const ORIGIN = 'http://localhost:5173';
const QUOTE = { base: 1250, adjustmentPct: -4 };
const FEE = { ...QUOTE, feeBasisPoints: 540, fixedCents: 30 };

/** Crea la orden en el PayPal simulado y la aprueba. @param {string} customId @param {number} cents */
async function approvedPaypalOrder(customId, cents) {
	const created = await gw.createOrder(
		buildPaypalOrder({
			customId,
			description: 'Prueba',
			usdCents: cents,
			returnUrl: `${ORIGIN}/paypal/vuelta`,
			cancelUrl: `${ORIGIN}/paypal/vuelta?cancelado=1`
		}),
		'req'
	);
	decideMockPaypalOrder(created.id, 'approve');
	return /** @type {string} */ (created.id);
}

describe('propinas con PayPal', () => {
	async function paypalTip() {
		const tip = await createTip(t.db, {
			amount: 10_000,
			message: null,
			category: null,
			slug: null,
			source: 'fondo'
		});
		const cents = /** @type {number} */ (usdCentsForArs(10_000, QUOTE.base, QUOTE.adjustmentPct));
		await setTipPaypalCharge(t.db, tip.id, { usdCents: cents, base: QUOTE.base });
		const ppId = await approvedPaypalOrder(paypalTipCustomId(tip.id), cents);
		await setTipPaypalOrder(t.db, tip.id, ppId);
		return { tip, ppId, cents };
	}

	it('se aprueba con lo neto, una sola vez (vuelta + webhook)', async () => {
		const { tip, ppId, cents } = await paypalTip();
		expect(cents).toBe(834);
		const payment = await settlePaypalOrder(gw, ppId);
		const first = await applyPaypalTipPayment(t.db, payment);
		expect(first).toMatchObject({ outcome: 'updated', newlyApproved: true });
		const again = await applyPaypalTipPayment(t.db, await settlePaypalOrder(gw, ppId));
		expect(again).toMatchObject({ outcome: 'unchanged', newlyApproved: false });
		const saved = await getTip(t.db, tip.id);
		expect(saved).toMatchObject({
			status: 'approved',
			provider: 'paypal',
			currency: 'USD',
			usd_gross_cents: 834,
			// 834 − (5,4 % + 30) = 834 − 75 = 759
			usd_net_cents: 759,
			rate_base: 1250,
			paypal_capture_id: payment.captureId
		});
		// Un pago de Mercado Pago nunca la toca.
		expect(saved?.mp_payment_id).toBeNull();
	});

	it('monto o propina que no coinciden: no se aplica', async () => {
		const { ppId } = await paypalTip();
		const payment = await settlePaypalOrder(gw, ppId);
		expect((await applyPaypalTipPayment(t.db, { ...payment, amountCents: 1 })).outcome).toBe(
			'mismatch'
		);
		expect(
			(await applyPaypalTipPayment(t.db, { ...payment, paypalOrderId: 'OTRAORDEN' })).outcome
		).toBe('unknown-tip');
	});

	it('cancelada en PayPal: no se completó; un pago que llega después igual la aprueba', async () => {
		const { tip, ppId } = await paypalTip();
		await cancelPaypalTip(t.db, tip.id, ppId);
		expect((await getTip(t.db, tip.id))?.status).toBe('rejected');
		await applyPaypalTipPayment(t.db, await settlePaypalOrder(gw, ppId));
		expect((await getTip(t.db, tip.id))?.status).toBe('approved');
	});

	it('reembolsada en PayPal: pasa a reembolsada', async () => {
		const { tip, ppId } = await paypalTip();
		const payment = await settlePaypalOrder(gw, ppId);
		await applyPaypalTipPayment(t.db, payment);
		await gw.refundCapture(/** @type {string} */ (payment.captureId), 'r');
		await applyPaypalTipPayment(t.db, await settlePaypalOrder(gw, ppId));
		expect((await getTip(t.db, tip.id))?.status).toBe('refunded');
	});
});

describe('entradas con PayPal', () => {
	const TYPE = { id: 'general', price: 8000, capacity: 5 };

	/** @param {{ fee?: boolean }} [o] */
	async function paypalOrder({ fee = false } = {}) {
		const reserved = await reserveOrder(t.db, {
			eventSlug: 'fiesta',
			type: TYPE,
			quantity: 1,
			holders: [{ name: 'Persona de Prueba', pronouns: '' }],
			buyer: { name: 'Persona de Prueba', email: 'prueba@example.com', dni: '30000000' },
			method: 'paypal',
			// La tasa de MP no cuenta con PayPal: su recargo sale de `paypalFee`.
			feeBasisPoints: 500,
			paypalFee: fee ? FEE : null
		});
		if (!reserved.ok) throw new Error('no se reservó');
		const order = reserved.order;
		expect(order.total).toBe(fee ? 8000 + paypalSurcharge(8000, FEE) : 8000);
		const cents = /** @type {number} */ (
			usdCentsForArs(order.total, QUOTE.base, QUOTE.adjustmentPct)
		);
		await setPaypalCharge(t.db, order.id, { usdCents: cents, ...QUOTE });
		const ppId = await approvedPaypalOrder(PAYPAL_ORDER_PREFIX + order.id, cents);
		await setPaypalOrder(t.db, order.id, ppId);
		return { order, ppId, cents };
	}

	/** @param {import('./payments.js').PaypalPayment} p @param {string} orderId */
	const asOrderPayment = (p, orderId) => ({ ...p, external_reference: orderId });

	it('se aprueba, emite las entradas y guarda la comisión; repetir no hace nada', async () => {
		const { order, ppId, cents } = await paypalOrder();
		const payment = asOrderPayment(await settlePaypalOrder(gw, ppId), order.id);
		const res = await applyPayment(t.db, payment);
		expect(res).toMatchObject({ outcome: 'updated', newlyApproved: true });
		expect(await getOrderTickets(t.db, order.id)).toHaveLength(1);
		const saved = await getOrder(t.db, order.id);
		const fee = Math.round(cents * 0.054) + 30;
		expect(saved).toMatchObject({
			status: 'approved',
			payment_method: 'paypal',
			paypal_capture_id: payment.captureId,
			mp_payment_id: null,
			usd_amount_cents: cents,
			usd_fee_cents: fee,
			// La comisión en pesos, con la cotización de la orden: floor(fee × 1250 × 0,96).
			mp_fee_amount: Math.floor((fee / 100) * 1200)
		});
		const again = await applyPayment(t.db, payment);
		expect(again).toMatchObject({ outcome: 'unchanged', newlyApproved: false });
		expect(await getOrderTickets(t.db, order.id)).toHaveLength(1);
		// Los reportes la cuentan como comisión del medio de pago.
		const row = await t.db
			.prepare(`SELECT ${MP_FEE_SQL} AS fee FROM orders WHERE id = ?1`)
			.bind(order.id)
			.first();
		expect(row?.fee).toBe(saved?.mp_fee_amount);
	});

	it('dólares que no coinciden, otra orden de PayPal o un pago de MP: no se aplica', async () => {
		const { order, ppId } = await paypalOrder();
		const payment = asOrderPayment(await settlePaypalOrder(gw, ppId), order.id);
		expect((await applyPayment(t.db, { ...payment, amountCents: 100 })).outcome).toBe('mismatch');
		expect((await applyPayment(t.db, { ...payment, paypalOrderId: 'OTRA' })).outcome).toBe(
			'mismatch'
		);
		const mp = {
			id: 1,
			status: 'approved',
			external_reference: order.id,
			transaction_amount: 8000,
			currency_id: 'ARS'
		};
		expect((await applyPayment(t.db, mp)).outcome).toBe('mismatch');
		expect((await getOrder(t.db, order.id))?.status).toBe('pending');
	});

	it('cancelada en PayPal antes de pagar: se cancela y libera el lugar', async () => {
		const { order, ppId } = await paypalOrder();
		expect(await cancelPaypalOrder(t.db, order.id, 'OTRA')).toBe(false);
		expect(await cancelPaypalOrder(t.db, order.id, ppId)).toBe(true);
		expect((await getOrder(t.db, order.id))?.status).toBe('cancelled');
	});

	it('reembolso desde el panel: pide a PayPal y marca la orden', async () => {
		const { order, ppId } = await paypalOrder();
		await applyPayment(t.db, asOrderPayment(await settlePaypalOrder(gw, ppId), order.id));
		const approved = /** @type {import('$lib/server/tickets/orders.js').Order} */ (
			await getOrder(t.db, order.id)
		);
		const r = await refundFromPanel({
			db: t.db,
			order: approved,
			by: 'gorrite',
			gateway: async () => null,
			paypal: async () => gw
		});
		expect(r.result).toBe('refunded');
		expect((await gw.getCapture(String(approved.paypal_capture_id))).status).toBe('REFUNDED');
		// El webhook del reembolso después no cambia nada.
		const late = await applyPayment(
			t.db,
			asOrderPayment(await settlePaypalOrder(gw, ppId), order.id)
		);
		expect(late.outcome).toBe('unchanged');
		// Sin PayPal configurado: no se marca nada.
		const other = await paypalOrder();
		await applyPayment(
			t.db,
			asOrderPayment(await settlePaypalOrder(gw, other.ppId), other.order.id)
		);
		const r2 = await refundFromPanel({
			db: t.db,
			order: /** @type {any} */ (await getOrder(t.db, other.order.id)),
			by: 'gorrite',
			gateway: async () => null
		});
		expect(r2.result).toBe('no-gateway');
	});

	it('con recargo: la orden lo guarda como el de MP y lo neto de PayPal alcanza el precio', async () => {
		const { order, ppId } = await paypalOrder({ fee: true });
		expect(order.surcharge_amount).toBe(838);
		await applyPayment(t.db, asOrderPayment(await settlePaypalOrder(gw, ppId), order.id));
		const saved = /** @type {any} */ (await getOrder(t.db, order.id));
		const net = saved.usd_amount_cents - saved.usd_fee_cents;
		expect(net).toBeGreaterThanOrEqual(
			/** @type {number} */ (usdCentsForArs(8000, QUOTE.base, QUOTE.adjustmentPct))
		);
	});

	it('«Reembolsar todas» también devuelve las de PayPal por la API', async () => {
		const { order, ppId } = await paypalOrder();
		await applyPayment(t.db, asOrderPayment(await settlePaypalOrder(gw, ppId), order.id));
		const preview = await refundAllPreview(t.db, 'fiesta');
		expect(preview.mp.count).toBe(1);
		expect(preview.manual).toEqual([]);
		const batch = await refundAllBatch({
			db: t.db,
			eventSlug: 'fiesta',
			by: 'gorrite',
			gateway: async () => null,
			paypal: async () => gw
		});
		expect(batch.results.map((r) => r.result)).toEqual(['refunded']);
		const saved = /** @type {any} */ (await getOrder(t.db, order.id));
		expect(saved.status).toBe('refunded');
		expect((await gw.getCapture(saved.paypal_capture_id)).status).toBe('REFUNDED');
	});
});

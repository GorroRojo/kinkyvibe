import { describe, expect, it } from 'vitest';
import {
	buildPaypalOrder,
	parseCustomId,
	paymentFromPaypalOrder,
	usdCents,
	usdCentsForArs,
	usdValue,
	webhookTarget
} from './payments.js';
import {
	PAYPAL_FEE_DEFAULT,
	estimateArs,
	parsePaypalFee,
	paypalSurcharge
} from '$lib/utils/paypal.js';
import { computePrice } from '$lib/utils/tickets.js';

describe('pesos → dólares para cobrar', () => {
	it('redondea para arriba con la base y el ajuste', () => {
		// 10.000 / 1.250 = 8 exactos.
		expect(usdCentsForArs(10_000, 1250, 0)).toBe(800);
		// 10.000 / (1.250 × 0,96 = 1.200) = 8,333… → 8,34.
		expect(usdCentsForArs(10_000, 1250, -4)).toBe(834);
		// 1 peso de más ya sube un centavo.
		expect(usdCentsForArs(10_001, 1250, 0)).toBe(801);
		expect(usdCentsForArs(0, 1250, 0)).toBeNull();
		expect(usdCentsForArs(1000, 0, 0)).toBeNull();
		expect(usdCentsForArs(1000, 1250, -100)).toBeNull();
	});

	it('lo cobrado, pasado a pesos con la misma cuenta, alcanza el precio', () => {
		for (const ars of [500, 1000, 8000, 12_345, 99_999, 250_000]) {
			for (const [base, adj] of [
				[1180.5, -4],
				[1432.25, 0],
				[999.99, 2.5]
			]) {
				const cents = /** @type {number} */ (usdCentsForArs(ars, base, adj));
				expect(estimateArs(cents, base, adj)).toBeGreaterThanOrEqual(ars);
				expect(estimateArs(cents - 1, base, adj)).toBeLessThan(ars);
			}
		}
	});

	it('formato de montos de PayPal', () => {
		expect(usdValue(834)).toBe('8.34');
		expect(usdValue(5)).toBe('0.05');
		expect(usdCents('8.34')).toBe(834);
		expect(usdCents('8.3')).toBe(830);
		expect(usdCents('8')).toBe(800);
		expect(usdCents('-1')).toBeNull();
		expect(usdCents(undefined)).toBeNull();
	});
});

describe('custom_id', () => {
	it('reconoce lo de kinkyvibe e ignora lo demás (la app es compartida con el Fondo)', () => {
		expect(parseCustomId('kv-propina:abc')).toEqual({ kind: 'propina', id: 'abc' });
		expect(parseCustomId('kv-entrada:xyz')).toEqual({ kind: 'entrada', id: 'xyz' });
		expect(parseCustomId('fondo-suscripcion:1')).toBeNull();
		expect(parseCustomId(null)).toBeNull();
	});

	it('la orden: USD, sin envío, pagar ahora, con la vuelta', () => {
		const body = buildPaypalOrder({
			customId: 'kv-entrada:o1',
			description: 'x'.repeat(200),
			usdCents: 1234,
			returnUrl: 'https://kinkyvibe.ar/paypal/vuelta',
			cancelUrl: 'https://kinkyvibe.ar/paypal/vuelta?cancelado=1'
		});
		expect(body.intent).toBe('CAPTURE');
		expect(body.purchase_units[0].amount).toEqual({ currency_code: 'USD', value: '12.34' });
		expect(body.purchase_units[0].description).toHaveLength(127);
		expect(body.payment_source.paypal.experience_context).toMatchObject({
			shipping_preference: 'NO_SHIPPING',
			user_action: 'PAY_NOW',
			return_url: 'https://kinkyvibe.ar/paypal/vuelta'
		});
	});
});

/** @param {string} status @param {Record<string, unknown>} [o] */
function captured(status, o = {}) {
	return {
		id: 'ORDER1',
		status: 'COMPLETED',
		purchase_units: [
			{
				custom_id: 'kv-entrada:o1',
				amount: { currency_code: 'USD', value: '12.34' },
				payments: {
					captures: [
						{
							id: 'CAP1',
							status,
							custom_id: 'kv-entrada:o1',
							amount: { currency_code: 'USD', value: '12.34' },
							seller_receivable_breakdown: {
								gross_amount: { currency_code: 'USD', value: '12.34' },
								paypal_fee: { currency_code: 'USD', value: '0.97' },
								net_amount: { currency_code: 'USD', value: '11.37' }
							}
						}
					]
				}
			}
		],
		...o
	};
}

describe('leer una orden de PayPal', () => {
	it('captura completada: aprobado, con la comisión y lo neto', () => {
		expect(paymentFromPaypalOrder(captured('COMPLETED'))).toEqual({
			provider: 'paypal',
			id: 'CAP1',
			paypalOrderId: 'ORDER1',
			captureId: 'CAP1',
			status: 'approved',
			external_reference: 'kv-entrada:o1',
			currency_id: 'USD',
			amountCents: 1234,
			feeCents: 97,
			netCents: 1137
		});
	});

	it('los estados de la captura', () => {
		/** @param {string} s */
		const st = (s) => paymentFromPaypalOrder(captured(s)).status;
		expect(st('REFUNDED')).toBe('refunded');
		expect(st('PARTIALLY_REFUNDED')).toBe('approved');
		expect(st('DECLINED')).toBe('rejected');
		expect(st('PENDING')).toBe('in_process');
		expect(st('REVERSED')).toBe('charged_back');
	});

	it('sin captura: pendiente (o cancelada si se anuló), sin id de cobro', () => {
		const created = {
			id: 'ORDER2',
			status: 'APPROVED',
			purchase_units: [
				{ custom_id: 'kv-propina:t', amount: { currency_code: 'USD', value: '3.00' } }
			]
		};
		expect(paymentFromPaypalOrder(created)).toMatchObject({
			id: 'ORDER2',
			captureId: null,
			status: 'pending',
			amountCents: 300
		});
		expect(paymentFromPaypalOrder({ ...created, status: 'VOIDED' }).status).toBe('cancelled');
	});
});

describe('webhookTarget (qué orden ir a buscar)', () => {
	it('órdenes, capturas y reembolsos', () => {
		expect(
			webhookTarget({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORDER1' } })
		).toEqual({ orderId: 'ORDER1' });
		expect(
			webhookTarget({
				event_type: 'PAYMENT.CAPTURE.COMPLETED',
				resource: { id: 'CAP1', supplementary_data: { related_ids: { order_id: 'ORDER1' } } }
			})
		).toEqual({ orderId: 'ORDER1' });
		expect(
			webhookTarget({
				event_type: 'PAYMENT.CAPTURE.REFUNDED',
				resource: {
					id: 'REF1',
					links: [{ rel: 'up', href: 'https://api.paypal.com/v2/payments/captures/CAP1' }]
				}
			})
		).toEqual({ captureId: 'CAP1' });
		// Un reembolso sin link a su captura: no se adivina (su id no es una captura).
		expect(
			webhookTarget({ event_type: 'PAYMENT.CAPTURE.REFUNDED', resource: { id: 'REF1' } })
		).toBeNull();
		expect(
			webhookTarget({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: {} })
		).toBeNull();
	});
});

describe('recargo de PayPal (la comisión la paga quien compra)', () => {
	const fee = { base: 1250, adjustmentPct: -4, feeBasisPoints: 540, fixedCents: 30 };

	it('con el recargo, lo que queda después de la comisión de PayPal alcanza el precio', () => {
		for (const ars of [500, 8000, 12_345, 99_999, 250_000]) {
			for (const f of [
				fee,
				{ ...fee, base: 1432.25, adjustmentPct: 0 },
				{ ...fee, fixedCents: 0 }
			]) {
				const surcharge = paypalSurcharge(ars, f);
				expect(surcharge).toBeGreaterThan(0);
				const usd = /** @type {number} */ (
					usdCentsForArs(ars + surcharge, f.base, f.adjustmentPct)
				);
				const net = usd - Math.round((usd * f.feeBasisPoints) / 10_000) - f.fixedCents;
				expect(net).toBeGreaterThanOrEqual(
					/** @type {number} */ (usdCentsForArs(ars, f.base, f.adjustmentPct)) - 1
				);
				expect(estimateArs(net + 1, f.base, f.adjustmentPct)).toBeGreaterThanOrEqual(ars);
			}
		}
		// 8.000 → 8.838 (el recargo es 838): US$ 7,37 brutos, US$ 6,67 netos.
		expect(paypalSurcharge(8000, fee)).toBe(838);
	});

	it('sin comisión o con datos raros: sin recargo', () => {
		expect(paypalSurcharge(8000, { ...fee, feeBasisPoints: 0, fixedCents: 0 })).toBe(0);
		expect(paypalSurcharge(0, fee)).toBe(0);
		expect(paypalSurcharge(8000, { ...fee, base: 0 })).toBe(0);
		expect(paypalSurcharge(8000, { ...fee, feeBasisPoints: 5000 })).toBe(0);
	});

	it('computePrice: el recargo de PayPal va como el de MP (en el total, con los extras)', () => {
		const p = computePrice({
			price: 8000,
			quantity: 1,
			method: 'paypal',
			paypalFee: fee,
			extras: 2000
		});
		expect(p.surcharge).toBe(paypalSurcharge(10_000, fee));
		expect(p.paid).toBe(10_000 + p.surcharge);
		// Sin la cotización (o con otro medio), nada.
		expect(computePrice({ price: 8000, quantity: 1, method: 'paypal' }).surcharge).toBe(0);
		expect(
			computePrice({ price: 8000, quantity: 1, method: 'transferencia', paypalFee: fee }).surcharge
		).toBe(0);
	});

	it('la comisión de Ajustes › PayPal', () => {
		expect(parsePaypalFee('5,4', '0,30')).toEqual({ basisPoints: 540, fixedCents: 30 });
		expect(parsePaypalFee('', '')).toEqual(PAYPAL_FEE_DEFAULT);
		expect(parsePaypalFee('4 %', 'US$ 0.49')).toEqual({ basisPoints: 400, fixedCents: 49 });
		expect(parsePaypalFee('60', '0,30')).toBeNull();
		expect(parsePaypalFee('abc', '0,30')).toBeNull();
		expect(parsePaypalFee('5,4', '-1')).toBeNull();
	});
});

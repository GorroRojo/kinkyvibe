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
import { estimateArs } from '$lib/utils/paypal.js';

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

/**
 * Cobrar con PayPal (docs/paypal.md, decisiones 0054 y 0059): lo que comparten las propinas y las
 * entradas. Pesos → dólares con la cotización del día, el cuerpo de la orden de PayPal, cómo se lee
 * una orden de PayPal (su captura, la comisión y lo neto) y cómo se termina de cobrar una orden
 * aprobada (capturar).
 *
 * Las órdenes de PayPal llevan `custom_id` con un prefijo de kinkyvibe: `kv-propina:<id>` (una
 * propina) o `kv-entrada:<id>` (una compra de entradas). La app de PayPal es la misma que la de
 * fondo.kinkyvibe.ar: lo que no empieza con `kv-` no es nuestro y se ignora.
 */
import { MAX_LIVE_AGE_DAYS, arDay, daysBetween, rateForDay } from './rates.js';
import { getAdjustment } from './index.js';
import { env } from '$env/dynamic/private';
import { isPaypalMock, paypalCharging } from './gateway.js';
import { effectiveRate, usdCentsForArs } from '$lib/utils/paypal.js';

export { usdCentsForArs };

export const PAYPAL_TIP_PREFIX = 'kv-propina:';
export const PAYPAL_ORDER_PREFIX = 'kv-entrada:';

/**
 * Lo que dice un `custom_id`: de qué es y su id, o `null` si no es de kinkyvibe.
 *
 * @param {unknown} customId
 * @returns {{ kind: 'propina' | 'entrada', id: string } | null}
 */
export function parseCustomId(customId) {
	if (typeof customId !== 'string') return null;
	if (customId.startsWith(PAYPAL_TIP_PREFIX)) {
		return { kind: 'propina', id: customId.slice(PAYPAL_TIP_PREFIX.length) };
	}
	if (customId.startsWith(PAYPAL_ORDER_PREFIX)) {
		return { kind: 'entrada', id: customId.slice(PAYPAL_ORDER_PREFIX.length) };
	}
	return null;
}

/** `1234` → `'12.34'` (el formato de montos de PayPal). */
export function usdValue(/** @type {number} */ cents) {
	return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

/** `'12.34'` → `1234`, o `null`. */
export function usdCents(/** @type {unknown} */ value) {
	if (typeof value !== 'string' && typeof value !== 'number') return null;
	const s = String(value).trim();
	if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
	const [int, dec = ''] = s.split('.');
	return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

/**
 * La cotización con la que se cobra ahora: la base de hoy (o la del último día guardado, de hasta
 * {@link MAX_LIVE_AGE_DAYS} días antes, por fines de semana y feriados) y el ajuste de ahora. Sin
 * una cotización reciente, `null`: PayPal no se ofrece (no se cobra con un número viejo).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {number} [now]
 * @returns {Promise<{ base: number, adjustmentPct: number, rate: number, day: string } | null>}
 */
export async function chargeQuote(db, now = Date.now()) {
	const today = arDay(now);
	const [rate, adjustment] = await Promise.all([rateForDay(db, today), getAdjustment(db)]);
	if (!rate || daysBetween(rate.day, today) > MAX_LIVE_AGE_DAYS) {
		// DEV ONLY: con el PayPal simulado, una cotización inventada si la base local no tiene una
		// (`PAYPAL_MOCK_RATE` en .env.tickets). En el build `isPaypalMock()` es siempre `false`.
		const mock = isPaypalMock() ? Number(env.PAYPAL_MOCK_RATE) : NaN;
		if (!(mock > 0)) return null;
		return {
			base: mock,
			adjustmentPct: adjustment.pct,
			rate: effectiveRate(mock, adjustment.pct),
			day: today
		};
	}
	return {
		base: rate.compra,
		adjustmentPct: adjustment.pct,
		rate: effectiveRate(rate.compra, adjustment.pct),
		day: rate.day
	};
}

/**
 * El cuerpo de una orden de PayPal (Orders v2, `intent: CAPTURE`): un solo ítem en dólares, sin
 * envío, con «Pagar ahora» y la vuelta al sitio.
 *
 * @param {{ customId: string, description: string, usdCents: number, returnUrl: string, cancelUrl: string }} input
 */
export function buildPaypalOrder({ customId, description, usdCents, returnUrl, cancelUrl }) {
	return {
		intent: 'CAPTURE',
		purchase_units: [
			{
				custom_id: customId.slice(0, 127),
				description: description.slice(0, 127),
				soft_descriptor: 'KINKYVIBE',
				amount: { currency_code: 'USD', value: usdValue(usdCents) }
			}
		],
		payment_source: {
			paypal: {
				experience_context: {
					brand_name: 'Kinky Vibe',
					locale: 'es-AR',
					shipping_preference: 'NO_SHIPPING',
					user_action: 'PAY_NOW',
					return_url: returnUrl,
					cancel_url: cancelUrl
				}
			}
		}
	};
}

/**
 * @typedef {{
 *   provider: 'paypal',
 *   id: string,
 *   paypalOrderId: string,
 *   captureId: string | null,
 *   status: string,
 *   external_reference: string | null,
 *   currency_id: string | null,
 *   amountCents: number | null,
 *   feeCents: number | null,
 *   netCents: number | null
 * }} PaypalPayment
 * Una orden de PayPal leída de la API, con el estado en el vocabulario de Mercado Pago
 * (`approved`, `rejected`, `refunded`, `charged_back`, `cancelled`, `pending`, `in_process`) para
 * usar las mismas máquinas de estados. `id`: la captura (o la orden, si todavía no hay captura).
 */

/** Estado de una captura → estado de pago. */
const CAPTURE_STATUS = /** @type {Record<string, string>} */ ({
	COMPLETED: 'approved',
	PARTIALLY_REFUNDED: 'approved',
	PENDING: 'in_process',
	DECLINED: 'rejected',
	FAILED: 'rejected',
	REFUNDED: 'refunded',
	REVERSED: 'charged_back'
});

/**
 * Lee una orden de PayPal (`GET /v2/checkout/orders/{id}` o la respuesta de capturar).
 *
 * @param {any} order
 * @returns {PaypalPayment}
 */
export function paymentFromPaypalOrder(order) {
	const unit = order?.purchase_units?.[0] ?? {};
	const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
	// La última captura (normalmente hay una sola).
	const capture = captures.length ? captures[captures.length - 1] : null;
	const breakdown = capture?.seller_receivable_breakdown ?? null;
	const status = capture
		? (CAPTURE_STATUS[String(capture.status)] ?? 'pending')
		: order?.status === 'VOIDED'
			? 'cancelled'
			: 'pending';
	const amount = capture?.amount ?? unit?.amount ?? null;
	return {
		provider: 'paypal',
		id: String(capture?.id ?? order?.id ?? ''),
		paypalOrderId: String(order?.id ?? ''),
		captureId: capture?.id ? String(capture.id) : null,
		status,
		external_reference:
			typeof (capture?.custom_id ?? unit?.custom_id) === 'string'
				? (capture?.custom_id ?? unit.custom_id)
				: null,
		currency_id: typeof amount?.currency_code === 'string' ? amount.currency_code : null,
		amountCents: usdCents(amount?.value),
		feeCents: usdCents(breakdown?.paypal_fee?.value),
		netCents: usdCents(breakdown?.net_amount?.value)
	};
}

/**
 * Trae una orden de PayPal y, si quien paga ya la aprobó, la captura (cobra). Idempotente: una
 * orden ya capturada se devuelve como está. Es lo que hacen la vuelta del pago, el re-chequeo y el
 * webhook (`CHECKOUT.ORDER.APPROVED`).
 *
 * @param {import('./gateway.js').PaypalGateway} gateway
 * @param {string} paypalOrderId
 * @returns {Promise<PaypalPayment>}
 */
export async function settlePaypalOrder(gateway, paypalOrderId) {
	let order = await gateway.getOrder(paypalOrderId);
	if (order?.status === 'APPROVED') order = await gateway.captureOrder(paypalOrderId);
	return paymentFromPaypalOrder(order);
}

/**
 * De un webhook (ya verificado), qué orden de PayPal hay que ir a buscar a la API. No se usa nada
 * más del cuerpo: el estado sale de la API.
 * - `CHECKOUT.ORDER.*`: el recurso es la orden.
 * - `PAYMENT.CAPTURE.*`: el recurso es la captura (su orden en `supplementary_data`), o un
 *   reembolso (su captura en el link `up`, y de la captura su orden).
 *
 * @param {any} event
 * @returns {{ orderId: string } | { captureId: string } | null}
 */
export function webhookTarget(event) {
	const type = String(event?.event_type ?? '');
	const r = event?.resource ?? {};
	if (type.startsWith('CHECKOUT.ORDER.')) {
		return typeof r.id === 'string' ? { orderId: r.id } : null;
	}
	if (type.startsWith('PAYMENT.CAPTURE.')) {
		const orderId = r?.supplementary_data?.related_ids?.order_id;
		if (typeof orderId === 'string') return { orderId };
		const up = (Array.isArray(r.links) ? r.links : []).find(
			(/** @type {any} */ l) => l?.rel === 'up' && typeof l.href === 'string'
		);
		const m = up && /\/v2\/payments\/captures\/([A-Z0-9]+)$/.exec(up.href);
		if (m) return { captureId: m[1] };
		if (type !== 'PAYMENT.CAPTURE.REFUNDED' && typeof r.id === 'string') {
			return { captureId: r.id };
		}
	}
	return null;
}

/** Los eventos a los que se suscribe el webhook de kinkyvibe en la app de PayPal (docs/paypal.md). */
export const WEBHOOK_EVENTS = Object.freeze([
	'CHECKOUT.ORDER.APPROVED',
	'PAYMENT.CAPTURE.COMPLETED',
	'PAYMENT.CAPTURE.DENIED',
	'PAYMENT.CAPTURE.PENDING',
	'PAYMENT.CAPTURE.REFUNDED',
	'PAYMENT.CAPTURE.REVERSED'
]);

/**
 * Lo que hace falta para ofrecer PayPal ahora: el interruptor prendido, las credenciales y una
 * cotización reciente. Si algo falta (o falla al leerlo), `null`: no se ofrece.
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {number} [now]
 */
export async function paypalOffer(db, now = Date.now()) {
	if (!db) return null;
	try {
		if (!(await paypalCharging(db))) return null;
		return await chargeQuote(db, now);
	} catch (error) {
		console.error('[paypal] no se pudo ver si se ofrece PayPal:', error);
		return null;
	}
}

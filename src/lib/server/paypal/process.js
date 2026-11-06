/**
 * Aplicar un pago de PayPal a lo que corresponda (docs/paypal.md): una propina (`kv-propina:`) o
 * una orden de entradas (`kv-entrada:`), por el mismo camino que los pagos de Mercado Pago
 * (`processPayment`: entradas, mails, «Cada venta», lista de espera, reportes). Lo usan la vuelta
 * del pago, el re-chequeo de las páginas de estado y el webhook.
 */
import { processPayment } from '$lib/server/tickets/index.js';
import { applyPaypalTipPayment } from '$lib/server/propinas/paypal.js';
import { parseCustomId, settlePaypalOrder } from './payments.js';

/**
 * @typedef {{
 *   kind: 'propina' | 'entrada' | null,
 *   id: string | null,
 *   outcome: string
 * }} PaypalOutcome
 */

/**
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   payment: import('./payments.js').PaypalPayment,
 *   origin: string,
 *   fetch: typeof fetch,
 *   platform?: App.Platform
 * }} input
 * @returns {Promise<PaypalOutcome>}
 */
export async function processPaypalPayment({ db, payment, origin, fetch: fetchFn, platform }) {
	const ref = parseCustomId(payment.external_reference);
	// No es de kinkyvibe (la app es compartida con fondo.kinkyvibe.ar): se ignora.
	if (!ref) return { kind: null, id: null, outcome: 'ignored' };
	if (ref.kind === 'propina') {
		const r = await applyPaypalTipPayment(db, payment);
		if (r.outcome === 'unknown-tip') {
			console.warn(`[propinas] pago de PayPal ${payment.id} sin propina conocida`);
		}
		return { kind: 'propina', id: ref.id, outcome: r.outcome };
	}
	const r = await processPayment({
		db,
		payment: { ...payment, external_reference: ref.id },
		origin,
		fetch: fetchFn,
		platform
	});
	return { kind: 'entrada', id: ref.id, outcome: r.outcome };
}

/**
 * Trae la orden de PayPal, la cobra si ya está aprobada y la aplica.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   gateway: import('./gateway.js').PaypalGateway,
 *   paypalOrderId: string,
 *   origin: string,
 *   fetch: typeof fetch,
 *   platform?: App.Platform
 * }} input
 * @returns {Promise<PaypalOutcome>}
 */
export async function settleAndProcess({ db, gateway, paypalOrderId, origin, fetch, platform }) {
	const payment = await settlePaypalOrder(gateway, paypalOrderId);
	return processPaypalPayment({ db, payment, origin, fetch, platform });
}

/**
 * La página a la que vuelve la persona después de PayPal, según de qué era el pago.
 *
 * @param {{ kind: 'propina' | 'entrada' | null, id: string | null }} target
 */
export function returnPath(target) {
	if (target.kind === 'propina' && target.id) return `/propinas/${target.id}/gracias`;
	if (target.kind === 'entrada' && target.id) return `/entradas/${target.id}/estado`;
	return '/';
}

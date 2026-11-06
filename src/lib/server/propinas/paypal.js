/**
 * Propinas con PayPal (docs/propinas.md, «PayPal»; decisiones 0054 y 0059). Usa la misma tabla
 * `tips` que las de Mercado Pago, con `provider = 'paypal'` y las columnas de la migración 0071.
 *
 * La persona elige el monto en pesos (el mismo formulario); se cobra en dólares con la cotización
 * del día y el ajuste (`usdCentsForArs`). Al crearla se guardan los dólares a cobrar
 * (`usd_gross_cents`) y la base del día (`rate_base`, no cambia nunca). Al aprobarse, lo neto
 * (`usd_net_cents`, después de la comisión de PayPal) y la captura. Lo que cuenta para el Fondo son
 * los dólares netos pasados a pesos al leer (`PAYPAL_FONDO_TIP_WHERE`, $lib/server/paypal/index.js).
 */
import { nextStatus } from '$lib/server/tickets/orders.js';
import { PAYPAL_TIP_PREFIX, parseCustomId } from '$lib/server/paypal/payments.js';
import { getTip, tipStatusFromPayment } from './index.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./index.js').Tip} Tip */
/** @typedef {import('$lib/server/paypal/payments.js').PaypalPayment} PaypalPayment */

/** @param {string} id */
export function paypalTipCustomId(id) {
	return PAYPAL_TIP_PREFIX + id;
}

/**
 * Marca una propina recién creada como de PayPal, con lo que se va a cobrar.
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {{ usdCents: number, base: number }} charge
 */
export async function setTipPaypalCharge(db, id, { usdCents, base }) {
	await db
		.prepare(
			`UPDATE tips SET provider = 'paypal', currency = 'USD', usd_gross_cents = ?2, rate_base = ?3
			WHERE id = ?1 AND status = 'pending'`
		)
		.bind(id, usdCents, base)
		.run();
}

/**
 * @param {D1Database} db
 * @param {string} id
 * @param {string} paypalOrderId
 */
export async function setTipPaypalOrder(db, id, paypalOrderId) {
	await db
		.prepare('UPDATE tips SET paypal_order_id = ?2 WHERE id = ?1')
		.bind(id, paypalOrderId)
		.run();
}

/**
 * Aplica un pago de PayPal (leído de la API, nunca del navegador ni del cuerpo del webhook) a su
 * propina. Idempotente, con las mismas reglas que las de Mercado Pago (`nextStatus`), usando la
 * captura (`paypal_capture_id`) como el pago.
 *
 * @param {D1Database} db
 * @param {PaypalPayment} payment
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ outcome: 'unknown-tip' | 'mismatch' | 'unchanged' | 'updated', tip: Tip | null, newlyApproved: boolean }>}
 */
export async function applyPaypalTipPayment(db, payment, { now = Date.now() } = {}) {
	const ref = parseCustomId(payment.external_reference);
	const tip = ref?.kind === 'propina' ? await getTip(db, ref.id) : null;
	if (!tip || tip.provider !== 'paypal' || tip.paypal_order_id !== payment.paypalOrderId) {
		return { outcome: 'unknown-tip', tip: null, newlyApproved: false };
	}
	if (payment.currency_id !== 'USD' || payment.amountCents !== tip.usd_gross_cents) {
		console.error(
			`[propinas] pago de PayPal ${payment.id} no coincide con la propina ${tip.id}: ` +
				`${payment.amountCents} ${payment.currency_id} ≠ ${tip.usd_gross_cents} USD (centavos)`
		);
		return { outcome: 'mismatch', tip, newlyApproved: false };
	}
	const incoming = tipStatusFromPayment(payment.status);
	// Sin captura (todavía no se cobró): no hay nada que aplicar.
	if (!payment.captureId) return { outcome: 'unchanged', tip, newlyApproved: false };
	const captureId = payment.captureId;
	let current = tip;
	for (let attempt = 0; attempt < 3; attempt++) {
		const next =
			incoming &&
			/** @type {import('./index.js').TipStatus | null} */ (
				nextStatus(current.status, current.paypal_capture_id ?? null, incoming, captureId)
			);
		if (!next) return { outcome: 'unchanged', tip: current, newlyApproved: false };
		const res = await db
			.prepare(
				`UPDATE tips SET status = ?3, paypal_capture_id = ?4, updated_at = ?5,
					usd_net_cents = COALESCE(?6, usd_net_cents),
					approved_at = CASE WHEN ?3 = 'approved' THEN ?5 ELSE approved_at END
				WHERE id = ?1 AND status = ?2`
			)
			.bind(tip.id, current.status, next, captureId, now, payment.netCents)
			.run();
		const fresh = /** @type {Tip} */ (await getTip(db, tip.id));
		if (res.meta.changes === 1) {
			return { outcome: 'updated', tip: fresh, newlyApproved: next === 'approved' };
		}
		current = fresh;
	}
	return { outcome: 'unchanged', tip: current, newlyApproved: false };
}

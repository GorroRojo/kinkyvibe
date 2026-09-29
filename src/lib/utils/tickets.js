/**
 * Reglas de entradas que se usan en el servidor Y en el navegador (sin secretos ni base de
 * datos). El navegador las usa solo para mostrar; el servidor siempre recalcula.
 */

/**
 * Cuántos bloques de datos por entrada se muestran como máximo en el formulario. No es un
 * límite de negocio (ese es el cupo): es para que el formulario siga siendo usable. Para
 * compras más grandes, la persona escribe a la organización.
 */
export const MAX_TICKETS_PER_FORM = 20;

/** Medios de pago que puede habilitar un evento en su frontmatter. */
export const PAYMENT_METHODS = /** @type {const} */ (['mercadopago', 'transferencia']);

/** @typedef {'percent' | 'fixed'} DiscountKind */

/**
 * Descuento en pesos enteros para un subtotal.
 *
 * - `percent`: `value`% del subtotal, redondeado al peso más cercano (0,5 hacia arriba).
 * - `fixed`: `value` pesos por compra (no por entrada).
 * - Nunca más que el subtotal: el total nunca queda negativo.
 *
 * @param {number} subtotal pesos enteros
 * @param {{ kind: DiscountKind, value: number } | null | undefined} discount
 * @returns {{ subtotal: number, discount: number, total: number }}
 */
export function applyDiscount(subtotal, discount) {
	let amount = 0;
	if (discount && Number.isFinite(discount.value) && discount.value > 0) {
		amount =
			discount.kind === 'percent'
				? Math.round((subtotal * Math.min(discount.value, 100)) / 100)
				: Math.round(discount.value);
	}
	amount = Math.max(0, Math.min(amount, subtotal));
	return { subtotal, discount: amount, total: subtotal - amount };
}

/**
 * Recargo para que, después de la comisión de Mercado Pago, quede `base`:
 * `bruto = ⌈base / (1 − tasa)⌉` en pesos enteros; recargo = bruto − base.
 *
 * La tasa va en centésimos de punto porcentual (773 = 7,73 %) para hacer la cuenta con enteros:
 * con decimales, 8000 / 0,8 da 10000,000000000002 y el redondeo hacia arriba sumaría un peso.
 *
 * @param {number} base pesos enteros (ya con fondo y descuento)
 * @param {number} feeBasisPoints 0 a 4999
 */
export function mpSurcharge(base, feeBasisPoints) {
	if (!(base > 0) || !(feeBasisPoints > 0) || feeBasisPoints >= 5000) return 0;
	const keep = 10000 - Math.round(feeBasisPoints);
	const gross = Math.floor((base * 10000 + keep - 1) / keep);
	return gross - base;
}

/**
 * "7.73" / "7,73" / 7.73 → 773 centésimos de punto. `null` si no es un porcentaje válido
 * (0 a 49,99 %).
 *
 * @param {unknown} raw
 * @returns {number | null}
 */
export function parseFeePercent(raw) {
	if (raw === undefined || raw === null || raw === '') return null;
	const n = Number(String(raw).trim().replace(',', '.'));
	if (!Number.isFinite(n) || n < 0 || n >= 50) return null;
	return Math.round(n * 100);
}

/**
 * Precio completo de una compra. Orden de las cuentas:
 *
 * 1. lista = precio × cantidad
 * 2. fondo = lo que cubre el Fondo KinkyVibe por entrada × cantidad
 * 3. subtotal = lista − fondo (lo que corresponde pagar)
 * 4. descuento (código) sobre el subtotal, redondeado al peso, nunca más que el subtotal
 * 5. recargo de Mercado Pago sobre lo que queda (solo con Mercado Pago y si queda algo)
 * 6. total = subtotal − descuento + recargo
 *
 * @param {{
 *   price: number,
 *   fondo?: number,
 *   quantity: number,
 *   discount?: { kind: DiscountKind, value: number } | null,
 *   method?: string,
 *   feeBasisPoints?: number
 * }} input
 */
export function computePrice({ price, fondo = 0, quantity, discount, method, feeBasisPoints = 0 }) {
	const list = price * quantity;
	const fondoAmount = Math.max(0, Math.min(fondo, price)) * quantity;
	const d = applyDiscount(list - fondoAmount, discount);
	const surcharge = method === 'mercadopago' ? mpSurcharge(d.total, feeBasisPoints) : 0;
	return {
		list,
		fondo: fondoAmount,
		subtotal: d.subtotal,
		discount: d.discount,
		surcharge,
		total: d.total + surcharge
	};
}

/**
 * Normaliza un DNI: acepta puntos y espacios ("12.345.678") y devuelve solo los dígitos, o
 * `null` si no tiene entre 7 y 9 dígitos.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeDni(raw) {
	if (typeof raw !== 'string') return null;
	const trimmed = raw.trim();
	if (!/^[0-9.\s]+$/.test(trimmed)) return null;
	const digits = trimmed.replace(/[.\s]/g, '');
	return /^\d{7,9}$/.test(digits) ? digits : null;
}

/**
 * Normaliza un código de descuento (mayúsculas, sin espacios alrededor). `null` si el formato
 * no es válido: 3 a 32 letras, números, - o _.
 *
 * @param {unknown} raw
 * @returns {string | null}
 */
export function normalizeCode(raw) {
	if (typeof raw !== 'string') return null;
	const code = raw.trim().toUpperCase();
	return /^[A-Z0-9_-]{3,32}$/.test(code) ? code : null;
}

/**
 * Referencia corta de una orden para poner en el concepto de la transferencia.
 *
 * @param {string} orderId
 */
export function orderReference(orderId) {
	return `KV-${orderId.slice(0, 8).toUpperCase()}`;
}

/** Contacto público de la organización (TICKETS_CONTACT_EMAIL lo reemplaza). */
export const DEFAULT_CONTACT_EMAIL = 'kinkyvibe.talleres@gmail.com';

/**
 * Política de devoluciones de la organización (texto de ellos, tal cual), en párrafos.
 *
 * @param {string} contactEmail
 */
export function refundPolicy(contactEmail) {
	return {
		title: '↩️ DEVOLUCIONES ↩️',
		paragraphs: [
			'En caso de sacar entrada y no poder asistir, tienen tiempo hasta 5 días hábiles previos al evento para avisarnos y así gestionar la devolución del dinero. También podemos ofrecerte a cambio algún taller grabado que tengamos disponible en la tienda en ese momento.',
			`Si pasás tu entrada a alguien más, por favor envianos un mail a ${contactEmail} avisándonos esto y aclarando la siguiente información sobre la persona que va a ocupar tu entrada: nombre, pronombre y mail.`
		]
	};
}

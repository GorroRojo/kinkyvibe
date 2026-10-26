/** Textos de las órdenes en el panel (pestañas Órdenes y Transferencias de la ficha). */
import { argDateLog } from '$lib/utils/dates.js';
export const ORDER_STATUS = /** @type {Record<string, string>} */ ({
	pending: 'Pendiente',
	awaiting_transfer: 'Esperando transferencia',
	approved: 'Aprobada',
	rejected: 'Rechazada',
	cancelled: 'Cancelada',
	refunded: 'Reembolsada',
	expired: 'Vencida'
});

export const ORDER_STATUS_TONE = /** @type {Record<string, 'ok' | 'warn' | 'bad' | 'neutral'>} */ ({
	pending: 'warn',
	awaiting_transfer: 'warn',
	approved: 'ok',
	rejected: 'bad',
	cancelled: 'neutral',
	refunded: 'neutral',
	expired: 'neutral'
});

export const PAYMENT_METHOD = /** @type {Record<string, string>} */ ({
	mercadopago: 'Mercado Pago',
	transferencia: 'Transferencia',
	gratis: 'Sin cargo',
	// Venta en la puerta (modo puerta) o carga a mano.
	efectivo: 'Efectivo',
	// Carga a mano ("Cargar entradas a mano"): otro medio.
	otro: 'Otro medio'
});

/**
 * Fecha y hora cortas en Argentina, como en los registros ("30/9/26 21:05").
 * @param {number} ms
 */
export function shortTime(ms) {
	return argDateLog(ms);
}

/**
 * DNI con puntos ("30.111.222"), o "—".
 * @param {string} dni
 */
export function formatDni(dni) {
	return dni ? Number(dni).toLocaleString('es-AR') : '—';
}

/**
 * Cuántos dígitos como mínimo para buscar órdenes por DNI (en el servidor: el DNI completo no va
 * a la página de Órdenes).
 */
export const DNI_SEARCH_MIN_DIGITS = 3;

/**
 * Los dígitos de lo que se escribió en el buscador si parece un DNI ("30.111" → "30111"), o ''
 * si tiene otra cosa que números, puntos, guiones o espacios, o menos de {@link DNI_SEARCH_MIN_DIGITS}.
 * @param {unknown} q
 */
export function dniQueryDigits(q) {
	const s = String(q ?? '').trim();
	if (!s || s.length > 20 || !/^[\d.\s-]+$/.test(s)) return '';
	const digits = s.replace(/\D/g, '');
	return digits.length >= DNI_SEARCH_MIN_DIGITS ? digits : '';
}

/** El `id` de cada orden en Ventas › Órdenes (`#orden-<id>` lleva a esa orden). */
const ANCHOR = 'orden-';

/**
 * Link a una orden en la ficha del evento (Ventas › Órdenes, con la página bajando hasta ella).
 * `null` si no hay orden del servidor: una venta sin conexión que todavía no se sincronizó
 * (`local:…`) solo está en el celu.
 * @param {string} ordersHref la pestaña Órdenes del evento (`eventHref(slug, 'ordenes')`; no se
 *   importa acá para que el servidor, que usa este módulo, no cargue los íconos del menú)
 * @param {string | null | undefined} orderId
 * @returns {string | null}
 */
export function orderHref(ordersHref, orderId) {
	const id = String(orderId ?? '').trim();
	if (!ordersHref || !id || id.startsWith('local:')) return null;
	return `${ordersHref}#${ANCHOR}${encodeURIComponent(id)}`;
}

/**
 * El id de la orden de un `#orden-<id>` ('' si el hash no es de una orden).
 * @param {string | null | undefined} hash
 */
export function orderIdFromHash(hash) {
	const m = /^#orden-(.+)$/.exec(String(hash ?? ''));
	if (!m) return '';
	try {
		return decodeURIComponent(m[1]);
	} catch {
		return '';
	}
}

/**
 * El filtro de Órdenes («Mostrar») que deja ver una orden de ese estado: el que está, si ya la
 * muestra; si no, «Todas» (un link a una orden reembolsada no cae en una lista que la esconde).
 * @param {string} current 'approved' | 'pending' | 'refunded' | 'all'
 * @param {string} status el de la orden
 */
export function orderFilterFor(current, status) {
	if (current === 'all' || current === status) return current;
	if (current === 'pending' && (status === 'pending' || status === 'awaiting_transfer'))
		return current;
	return 'all';
}

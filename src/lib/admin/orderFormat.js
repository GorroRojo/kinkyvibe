/** Textos de las órdenes en el panel (pestañas Órdenes y Transferencias de la ficha). */

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

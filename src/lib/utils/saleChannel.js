/**
 * La única regla para decir por qué canal salió una venta (docs/tickets.md, «Canal de venta»).
 * La usan todos los lugares del panel que cuentan ventas por canal: el gráfico de Ventas de cada
 * evento, la tarjeta de ventas del Inicio y el CSV de órdenes (decisión de gorrite, Mesa
 * `chica-536-canal-venta`: cuatro columnas). Pura: anda en el navegador, en el servidor y en
 * vitest.
 *
 * - `puerta`: vendida con la pantalla de la puerta (`channel = 'puerta'`), aunque haya salido $ 0
 *   a la gorra;
 * - `cortesia`: lo que salió $ 0 (`payment_method = 'gratis'`): cortesías e invitaciones cargadas a
 *   mano, $ 0 en la puerta en un tipo con precio, anotarse gratis en la página;
 * - `manual`: cargada a mano en el panel y cobrada (efectivo, transferencia u otro);
 * - `online`: todo lo demás, la compra de la página (Mercado Pago o transferencia). Una orden de
 *   antes de la columna `channel` cuenta como online.
 *
 * El total no depende de esto: solo en qué columna cae cada venta.
 */

/** Los canales, en el orden en que se muestran (y se apilan en el gráfico, de abajo hacia arriba). */
export const SALE_CHANNELS = /** @type {const} */ (['online', 'puerta', 'cortesia', 'manual']);

/** @typedef {(typeof SALE_CHANNELS)[number]} SaleChannel */

/** El nombre de cada canal en el panel. */
export const SALE_CHANNEL_LABELS = /** @type {Record<SaleChannel, string>} */ ({
	online: 'Online',
	puerta: 'En la puerta',
	cortesia: 'Cortesía / sin cargo',
	manual: 'Cargadas a mano'
});

/** El nombre de cada canal en una venta suelta (columna `canal` del CSV de órdenes). */
export const SALE_CHANNEL_SINGULAR = /** @type {Record<SaleChannel, string>} */ ({
	online: 'online',
	puerta: 'puerta',
	cortesia: 'cortesía',
	manual: 'cargada a mano'
});

/**
 * El canal de una orden.
 *
 * @param {{ channel?: string | null, payment_method?: string | null }} order
 * @returns {SaleChannel}
 */
export function saleChannel(order) {
	const channel = order.channel ?? 'online';
	if (channel === 'puerta') return 'puerta';
	if (order.payment_method === 'gratis') return 'cortesia';
	if (channel === 'manual') return 'manual';
	return 'online';
}

/**
 * Cuántas entradas por canal (suma `quantity`; sin `quantity`, 1 por orden).
 *
 * @param {Iterable<{ channel?: string | null, payment_method?: string | null,
 *   quantity?: number | string | null }>} orders
 * @returns {Record<SaleChannel, number>}
 */
export function countByChannel(orders) {
	/** @type {Record<SaleChannel, number>} */
	const out = { online: 0, puerta: 0, cortesia: 0, manual: 0 };
	for (const o of orders) {
		const n = o.quantity === undefined || o.quantity === null ? 1 : Number(o.quantity) || 0;
		out[saleChannel(o)] += n;
	}
	return out;
}

/** Textos de las órdenes en el panel (pestañas Órdenes y Transferencias de la ficha). */
import { argDateLog } from '$lib/utils/dates.js';
import { formatARS } from '$lib/utils/money.js';
import { fondoOptionLabel } from '$lib/utils/tickets.js';
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
	paypal: 'PayPal',
	transferencia: 'Transferencia',
	gratis: 'Sin cargo',
	// Venta en la puerta (modo puerta) o carga a mano.
	efectivo: 'Efectivo',
	// Carga a mano ("Cargar entradas a mano"): otro medio.
	otro: 'Otro medio'
});

/**
 * Lo que avisó Resend del mail de las entradas (`orders.email_problem`, webhook de Resend;
 * docs/mails.md, «Rebotes y quejas»). Lo que no está acá se muestra como «mail enviado».
 */
export const EMAIL_PROBLEM = /** @type {Record<string, string>} */ ({
	bounced: 'el mail rebotó',
	complained: 'marcó el mail como spam',
	suppressed: 'el mail rebotó (dirección bloqueada en Resend)'
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

/**
 * La plata de una orden en Ventas › Órdenes, en dos líneas (opción A de gorrite):
 *
 * - `main`: «1 × General · Pagó $ 13.776 · te quedan $ 13.528». Lo pagado es lo de las entradas
 *   (`total`, con el recargo de MP) más los extras; lo que queda es eso menos la comisión que
 *   informó MP. Sin comisión informada (transferencia, efectivo, o MP todavía no la mandó), sin
 *   «te quedan». Una orden sin cobrar (pendiente, vencida, rechazada…) dice «Total» y no «Pagó».
 * - `detail`: chica y gris, solo lo que corresponde: «$ 1.500 del Fondo · recargo MP $ 276 · MP
 *   se quedó $ 248», más la gorra, el aporte al Fondo, el código de descuento y los extras
 *   («2 × Trago $ 4.000»). Vacía si no hay nada.
 *
 * @param {{
 *   quantity: number,
 *   type: string,
 *   status: string,
 *   total: number,
 *   gorra?: number | null,
 *   fondo?: number | null,
 *   fondoOption?: string | null,
 *   contribution?: number | null,
 *   discountCode?: string | null,
 *   discountAmount?: number | null,
 *   surcharge?: number | null,
 *   mpFee?: number | null,
 *   extras?: { name: string, quantity: number, price: number }[],
 *   extrasAmount?: number | null,
 *   method?: string | null
 * }} o
 * @returns {{ main: string, detail: string }}
 */
export function orderMoneyLines(o) {
	const paid = Number(o.total) + Number(o.extrasAmount ?? 0);
	const charged = o.status === 'approved' || o.status === 'refunded';
	const main = [
		`${o.quantity} × ${o.type}`,
		`${charged ? 'Pagó' : 'Total'} ${formatARS(paid)}`,
		...(charged && o.mpFee != null ? [`te quedan ${formatARS(paid - o.mpFee)}`] : [])
	].join(' · ');
	const detail = [
		o.gorra != null && `a la gorra, ${formatARS(o.gorra)} c/u`,
		o.fondo && `${formatARS(o.fondo)} del Fondo`,
		o.contribution &&
			`aporte al Fondo ${formatARS(o.contribution)} (${fondoOptionLabel(o.fondoOption ?? '')})`,
		o.discountAmount && `código ${o.discountCode} −${formatARS(o.discountAmount)}`,
		...(o.extras ?? []).map((x) => `${x.quantity} × ${x.name} ${formatARS(x.quantity * x.price)}`),
		o.surcharge && `recargo ${o.method === 'paypal' ? 'PayPal' : 'MP'} ${formatARS(o.surcharge)}`,
		o.mpFee != null && `${o.method === 'paypal' ? 'PayPal' : 'MP'} se quedó ${formatARS(o.mpFee)}`
	]
		.filter(Boolean)
		.join(' · ');
	return { main, detail };
}

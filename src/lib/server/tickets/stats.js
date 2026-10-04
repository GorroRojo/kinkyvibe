/**
 * Números de la pestaña Ventas de la ficha de un evento (/admin/eventos/<slug>/ventas), sacados
 * de la lista de órdenes del evento (`listOrders`). Funciones puras: no tocan la base, así se
 * prueban sin D1 y no suman consultas.
 *
 * Solo cuentan las órdenes aprobadas, salvo `heldBreakdown` (reservas vigentes).
 */

/** Argentina no tiene horario de verano: UTC−3 fijo (igual que el resto del sitio). */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Estados que retienen cupo mientras la reserva está vigente (igual que `HOLDING` en discounts.js). */
const HOLDING_STATUSES = ['pending', 'rejected', 'awaiting_transfer'];

/**
 * @typedef {Pick<import('./orders.js').Order,
 *   'status' | 'quantity' | 'total' | 'created_at' | 'payment_method' | 'fondo_option'
 *   | 'fondo_amount' | 'fondo_contribution' | 'discount_code' | 'discount_amount' | 'expires_at'>
 * } StatsOrder
 */

/**
 * Fecha (YYYY-MM-DD) en Argentina de un instante.
 * @param {number} ms
 */
export function argentinaDay(ms) {
	return new Date(ms - AR_OFFSET_MS).toISOString().slice(0, 10);
}

/** @param {StatsOrder} o */
const approved = (o) => o.status === 'approved';

/**
 * Entradas vendidas por día en los últimos `days` días (hoy incluido, en hora de Argentina),
 * del más viejo al más nuevo. Los días sin ventas están, con 0.
 *
 * @param {StatsOrder[]} orders
 * @param {{ now?: number, days?: number }} [options]
 * @returns {{ date: string, tickets: number, orders: number, amount: number }[]}
 */
export function salesPerDay(orders, { now = Date.now(), days = 14 } = {}) {
	const n = Math.max(1, Math.min(90, Math.floor(days)));
	/** @type {Map<string, { date: string, tickets: number, orders: number, amount: number }>} */
	const byDay = new Map();
	for (let i = n - 1; i >= 0; i--) {
		const date = argentinaDay(now - i * DAY_MS);
		byDay.set(date, { date, tickets: 0, orders: 0, amount: 0 });
	}
	for (const o of orders) {
		if (!approved(o)) continue;
		const day = byDay.get(argentinaDay(o.created_at));
		if (!day) continue;
		day.tickets += o.quantity;
		day.orders += 1;
		day.amount += o.total;
	}
	return [...byDay.values()];
}

/** Orden fijo de los medios de pago (así la barra partida no cambia de colores entre eventos). */
export const PAYMENT_ORDER = /** @type {const} */ (['mercadopago', 'transferencia', 'gratis']);

/**
 * Cómo pagaron: por medio de pago, órdenes, entradas, monto y porcentaje de las entradas.
 * Siempre devuelve los 3 medios (en {@link PAYMENT_ORDER}), aunque tengan 0.
 *
 * @param {StatsOrder[]} orders
 * @returns {{ method: string, orders: number, tickets: number, amount: number, share: number }[]}
 */
export function paymentSplit(orders) {
	/** @type {Map<string, { method: string, orders: number, tickets: number, amount: number, share: number }>} */
	const by = new Map(
		PAYMENT_ORDER.map((method) => [method, { method, orders: 0, tickets: 0, amount: 0, share: 0 }])
	);
	let total = 0;
	for (const o of orders) {
		if (!approved(o)) continue;
		let row = by.get(o.payment_method);
		if (!row) {
			row = { method: o.payment_method, orders: 0, tickets: 0, amount: 0, share: 0 };
			by.set(o.payment_method, row);
		}
		row.orders += 1;
		row.tickets += o.quantity;
		row.amount += o.total;
		total += o.quantity;
	}
	const rows = [...by.values()];
	if (total) {
		for (const r of rows) r.share = Math.round((r.tickets / total) * 1000) / 10;
	}
	return rows;
}

/**
 * Fondo Kinky Vibe por opción de precio ("con el descuento del fondo", "solidaria"…): entradas,
 * lo que cubrió el fondo y lo que se aportó. `net` = aportes − fondo usado.
 *
 * @param {StatsOrder[]} orders
 */
export function fondoBreakdown(orders) {
	/** @type {Map<string, { option: string, tickets: number, used: number, contributed: number }>} */
	const by = new Map();
	let used = 0;
	let contributed = 0;
	for (const o of orders) {
		if (!approved(o)) continue;
		const key = o.fondo_option || 'completo';
		const row = by.get(key) ?? { option: key, tickets: 0, used: 0, contributed: 0 };
		row.tickets += o.quantity;
		row.used += o.fondo_amount;
		row.contributed += o.fondo_contribution;
		by.set(key, row);
		used += o.fondo_amount;
		contributed += o.fondo_contribution;
	}
	return { rows: [...by.values()], used, contributed, net: contributed - used };
}

/**
 * Códigos de descuento usados en las órdenes aprobadas, del más usado al menos usado.
 *
 * @param {StatsOrder[]} orders
 * @returns {{ code: string, orders: number, tickets: number, discounted: number }[]}
 */
export function codesUsed(orders) {
	/** @type {Map<string, { code: string, orders: number, tickets: number, discounted: number }>} */
	const by = new Map();
	for (const o of orders) {
		if (!approved(o) || !o.discount_code) continue;
		const row = by.get(o.discount_code) ?? {
			code: o.discount_code,
			orders: 0,
			tickets: 0,
			discounted: 0
		};
		row.orders += 1;
		row.tickets += o.quantity;
		row.discounted += o.discount_amount;
		by.set(o.discount_code, row);
	}
	return [...by.values()].sort((a, b) => b.orders - a.orders || a.code.localeCompare(b.code));
}

/**
 * Reservas vigentes (cuentan para el cupo): cuántas entradas están pagando con Mercado Pago y
 * cuántas esperan una transferencia.
 *
 * @param {StatsOrder[]} orders
 * @param {number} [now]
 */
export function heldBreakdown(orders, now = Date.now()) {
	let paying = 0;
	let transfers = 0;
	for (const o of orders) {
		if (!HOLDING_STATUSES.includes(o.status) || o.expires_at <= now) continue;
		if (o.status === 'awaiting_transfer') transfers += o.quantity;
		else paying += o.quantity;
	}
	return { paying, transfers, total: paying + transfers };
}

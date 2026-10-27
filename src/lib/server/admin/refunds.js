/**
 * Reembolsos desde el panel: el de una orden («Reembolsar…» en Ventas › Órdenes) y «Reembolsar
 * todas» de un evento cancelado (decisión 0051), que usa exactamente el mismo paso por orden.
 *
 * Una orden ({@link refundFromPanel}): Mercado Pago → reembolso TOTAL por la API de MP
 * (`gateway.refundPayment`, con la clave de idempotencia `refund-<orden>`) y después se marca la
 * orden (`refundOrder`, una sola sentencia condicional); transferencia, efectivo, otro medio o sin
 * cargo → solo se marca (la plata se devuelve a mano). Si MP no acepta, la orden no cambia.
 * Lo que sigue a un reembolso hecho (`afterRefund` en eventActions.js): queda en Actividad
 * (`order.refund`), sale el mail «Reembolsamos tu compra» y la lista de espera sigue.
 *
 * «Reembolsar todas» ({@link refundAllBatch}): solo eventos cancelados, solo órdenes aprobadas de
 * Mercado Pago compradas online y con número de pago ({@link isMpRefundable}); de a
 * {@link REFUND_ALL_BATCH} por pedido, una después de otra, en orden de compra. Las demás
 * aprobadas (puerta, carga a mano, transferencia) se listan «para devolver a mano» y no se tocan.
 */

import { getOrder, isValidOrderId, refundOrder } from '$lib/server/tickets/orders.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */
/** @typedef {import('$lib/server/tickets/index.js').Gateway} Gateway */

/**
 * Cuántas órdenes reembolsa «Reembolsar todas» por pedido: cada una es un pedido a Mercado Pago y
 * un mail, y un pedido del Worker tiene un límite de subpedidos y de tiempo. Las que faltan, con
 * «Seguir».
 */
export const REFUND_ALL_BATCH = 10;

/** Lo que hay que escribir para confirmar «Reembolsar todas». */
export const REFUND_ALL_WORD = 'REEMBOLSAR';

/**
 * @typedef {'refunded' | 'already' | 'not-approved' | 'no-gateway' | 'mp-failed' | 'not-marked'} RefundResult
 */

/**
 * El reembolso de una orden desde el panel, el mismo para «Reembolsar…» y para «Reembolsar
 * todas». Idempotente: una orden ya reembolsada no se vuelve a pedir a MP; dos pedidos a la vez
 * mandan la misma clave de idempotencia (`refund-<orden>`: MP devuelve el mismo reembolso) y la
 * orden se marca una sola vez (`refundOrder`: `'refunded'` le toca a uno solo de los dos).
 *
 * @param {{
 *   db: D1Database,
 *   order: Order,
 *   by: string,
 *   gateway: () => Promise<Gateway | null>
 * }} input `gateway`: se pide recién si la orden es de Mercado Pago
 * @returns {Promise<{ result: RefundResult, order: Order | null }>}
 */
export async function refundFromPanel({ db, order, by, gateway }) {
	if (order.status === 'refunded') return { result: 'already', order };
	if (order.status !== 'approved') return { result: 'not-approved', order };
	if (order.payment_method === 'mercadopago') {
		const gw = await gateway();
		if (!gw || !order.mp_payment_id) return { result: 'no-gateway', order };
		try {
			await gw.refundPayment(order.mp_payment_id, `refund-${order.id}`);
		} catch (error) {
			console.error(`[tickets] reembolso de ${order.id} rechazado por MP:`, error);
			// Un error o un corte del lado nuestro no quiere decir que MP no lo hizo: si el pago ya
			// figura reembolsado, se marca la orden (así nadie lo devuelve otra vez a mano).
			return (await refundedAtMp(db, gw, order, by)) ?? { result: 'mp-failed', order };
		}
	}
	const r = await refundOrder(db, { orderId: order.id, eventSlug: order.event_slug, by });
	if (r.result === 'refunded' || r.result === 'already')
		return { result: r.result, order: r.order };
	return { result: 'not-marked', order: r.order };
}

/**
 * Después de un error de `refundPayment`: ¿el reembolso salió igual? Le pregunta a MP por el pago
 * (`getPayment`); si figura `refunded`, marca la orden con el mismo `refundOrder` condicional. Si
 * no (o si MP tampoco contesta), vuelve a leer la orden: si mientras tanto quedó reembolsada (el
 * webhook de MP, otro pedido), es `'already'`. `null`: no hay señales de que haya salido.
 *
 * @param {D1Database} db
 * @param {Gateway} gw
 * @param {Order} order con `mp_payment_id`
 * @param {string} by
 * @returns {Promise<{ result: RefundResult, order: Order | null } | null>}
 */
async function refundedAtMp(db, gw, order, by) {
	try {
		const payment = await gw.getPayment(String(order.mp_payment_id));
		if (payment?.status === 'refunded') {
			console.warn(
				`[tickets] reembolso de ${order.id}: MP dio error pero el pago figura reembolsado; se marca la orden`
			);
			const r = await refundOrder(db, { orderId: order.id, eventSlug: order.event_slug, by });
			if (r.result === 'refunded' || r.result === 'already') {
				return { result: r.result, order: r.order };
			}
		}
	} catch (error) {
		console.error(`[tickets] no se pudo consultar el pago de ${order.id} en MP:`, error);
	}
	const fresh = await getOrder(db, order.id).catch(() => null);
	return fresh?.status === 'refunded' ? { result: 'already', order: fresh } : null;
}

/** Por qué no se reembolsó una orden, para el resumen. @type {Record<RefundResult, string>} */
export const REFUND_REASON = {
	refunded: 'Reembolsada.',
	already: 'Ya estaba reembolsada (no se hizo nada de nuevo).',
	'not-approved': 'Ya no está aprobada: no hay nada que reembolsar.',
	'no-gateway': 'Mercado Pago no está disponible (o la orden no tiene pago).',
	'mp-failed':
		'Mercado Pago no aceptó el reembolso (¿saldo insuficiente o más de 180 días?). No se cambió nada; detalle en los logs. Antes de devolverla a mano, revisá el pago en Mercado Pago: si figura reembolsado, no la devuelvas de nuevo.',
	'not-marked':
		'No se pudo terminar de marcar como reembolsada (el pedido a Mercado Pago puede haber salido): revisá el pago en Mercado Pago y la orden antes de hacer nada a mano.'
};

/**
 * ¿«Reembolsar todas» la devuelve por Mercado Pago? Aprobada, de MP, comprada online y con número
 * de pago. Las demás (puerta, carga a mano, transferencia) se devuelven a mano.
 *
 * @param {Pick<Order, 'status' | 'payment_method' | 'mp_payment_id'> & { channel?: string | null }} o
 */
export function isMpRefundable(o) {
	return (
		o.status === 'approved' &&
		o.payment_method === 'mercadopago' &&
		Boolean(o.mp_payment_id) &&
		(o.channel ?? 'online') === 'online'
	);
}

/** Las de {@link isMpRefundable} en SQL (alias `o`). */
const MP_REFUNDABLE_SQL = `o.status = 'approved' AND o.payment_method = 'mercadopago'
	AND o.mp_payment_id IS NOT NULL AND o.mp_payment_id != '' AND COALESCE(o.channel, 'online') = 'online'`;

/**
 * Lo que mostraría «Reembolsar todas» de un evento: las órdenes que se devuelven por MP (cuántas y
 * el total exacto) y las aprobadas que hay que devolver a mano (con cuánto); las sin cargo, solo
 * cuántas (no hay plata que devolver, se anulan una por una si hace falta).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 */
export async function refundAllPreview(db, eventSlug) {
	const { results } = await db
		.prepare(
			`SELECT o.* FROM orders o WHERE o.event_slug = ?1 AND o.status = 'approved'
			ORDER BY o.created_at, o.id`
		)
		.bind(eventSlug)
		.all();
	const orders = /** @type {(Order & { channel?: string | null })[]} */ (results);
	const mp = orders.filter(isMpRefundable);
	const rest = orders.filter((o) => !isMpRefundable(o));
	return {
		mp: { count: mp.length, total: mp.reduce((s, o) => s + o.total, 0) },
		manual: rest
			.filter((o) => o.total > 0)
			.map((o) => ({
				id: o.id,
				name: o.buyer_name,
				method: o.payment_method,
				channel: o.channel ?? 'online',
				total: o.total
			})),
		free: rest.filter((o) => o.total === 0).length
	};
}

/**
 * Una tanda de «Reembolsar todas»: las próximas `limit` órdenes de {@link isMpRefundable} del
 * evento después de `after` (la última de la tanda anterior; sin `after`, desde la primera), una
 * después de otra con {@link refundFromPanel}; un error en una no corta la tanda. `after` tiene que
 * ser una orden de este evento (si no, tira). Las que fallan quedan como estaban (aprobadas) para
 * hacerlas a mano; como la tanda siguiente arranca después de la última vista, no se reintentan
 * solas (volver a tocar «Reembolsar todas» desde el principio sí las reintenta, sin riesgo: lo ya
 * reembolsado no se vuelve a pedir).
 *
 * @param {{
 *   db: D1Database,
 *   eventSlug: string,
 *   by: string,
 *   gateway: () => Promise<Gateway | null>,
 *   after?: string | null,
 *   limit?: number,
 *   onRefunded?: (fresh: Order, before: Order) => Promise<void>
 * }} input `onRefunded`: lo que sigue a cada reembolso hecho (Actividad, mail, lista de espera)
 * @returns {Promise<{
 *   results: { id: string, name: string, total: number, result: RefundResult }[],
 *   after: string | null,
 *   remaining: number | null
 * }>} `remaining`: `null` si no se pudo contar
 */
export async function refundAllBatch({
	db,
	eventSlug,
	by,
	gateway,
	after = null,
	limit = REFUND_ALL_BATCH,
	onRefunded
}) {
	const from = after ? await refundAllCursor(db, eventSlug, after) : null;
	// Un `after` que no es una orden de este evento no vuelve a empezar desde la primera (eso
	// saltearía el control de cantidad y total de la primera tanda): la acción lo rechaza antes.
	if (after && !from) throw new RangeError('«after» no es una orden de este evento');
	const { results } = await db
		.prepare(
			`SELECT o.* FROM orders o WHERE o.event_slug = ?1 AND ${MP_REFUNDABLE_SQL}
				AND (?2 IS NULL OR o.created_at > ?2 OR (o.created_at = ?2 AND o.id > ?3))
			ORDER BY o.created_at, o.id LIMIT ?4`
		)
		.bind(eventSlug, from?.created_at ?? null, from?.id ?? '', limit)
		.all();
	const batch = /** @type {Order[]} */ (results);
	const out = [];
	for (const order of batch) {
		/** @type {RefundResult} */
		let result;
		try {
			const r = await refundFromPanel({ db, order, by, gateway });
			result = r.result;
			if (r.result === 'refunded' && r.order && onRefunded) {
				// La plata ya se devolvió: un error de acá (Actividad, mail) no cambia el resultado.
				await onRefunded(r.order, order).catch((error) =>
					console.error(`[tickets] reembolsar todas: lo de después de ${order.id} falló:`, error)
				);
			}
		} catch (error) {
			// Un error después de pedirle el reembolso a MP: puede haber salido. Queda para revisar.
			console.error(`[tickets] reembolsar todas ${eventSlug}: ${order.id} falló:`, error);
			result = 'not-marked';
		}
		console.log(`[tickets] reembolsar todas ${eventSlug}: ${order.id} → ${result}`);
		out.push({ id: order.id, name: order.buyer_name, total: order.total, result });
	}
	const last = batch.at(-1) ?? from;
	/** @type {number | null} */
	let remaining = null;
	try {
		const rest = await db
			.prepare(
				`SELECT COUNT(*) AS n FROM orders o WHERE o.event_slug = ?1 AND ${MP_REFUNDABLE_SQL}
					AND (?2 IS NULL OR o.created_at > ?2 OR (o.created_at = ?2 AND o.id > ?3))`
			)
			.bind(eventSlug, last?.created_at ?? null, last?.id ?? '')
			.first();
		remaining = Number(rest?.n ?? 0);
	} catch (error) {
		console.error(
			`[tickets] reembolsar todas ${eventSlug}: no se pudo contar lo que falta:`,
			error
		);
	}
	return { results: out, after: last?.id ?? null, remaining };
}

/**
 * La orden de `after` («Seguir»), solo si es de este evento; `null` si no.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} after
 */
export async function refundAllCursor(db, eventSlug, after) {
	if (!isValidOrderId(after)) return null;
	const order = await getOrder(db, after);
	return order && order.event_slug === eventSlug ? order : null;
}

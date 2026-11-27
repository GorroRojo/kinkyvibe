/**
 * Acciones sobre compras de Ventas › Órdenes que se hacen de a una (un botón en la tarjeta) y de a
 * varias (la barra de «Compras», `runBulkOrders`): las dos pasan por acá, así las reglas y lo que
 * queda en Actividad son las mismas. «Facturada» vive en invoiced.js (`invoicedFromPanel`, que
 * también usa Compras para facturar).
 *
 * La barra solo ofrece lo seguro y que se deshace ($lib/admin/orderBulk.js): marcar o desmarcar
 * facturadas, marcar revisadas y reenviar el mail de las entradas. Cada compra deja su propia
 * línea en Actividad, como si se hubiera tocado su botón (con `bulk: true` en el detalle).
 */
import { logAdminAction } from '$lib/server/admin/audit.js';
import { invoicedFromPanel } from '$lib/server/admin/invoiced.js';
import { clearReview, getOrder } from '$lib/server/tickets/orders.js';
import { sendOrderEmailResult } from '$lib/server/tickets/index.js';
import { orderReference } from '$lib/utils/tickets.js';
import { bulkBatch, isBulkAction } from '$lib/admin/orderBulk.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */

/**
 * La orden, si es de este evento.
 * @param {D1Database} db
 * @param {string} orderId
 * @param {string} slug
 */
async function eventOrder(db, orderId, slug) {
	if (!orderId || orderId.length > 64) return null;
	const order = await getOrder(db, orderId);
	return order && order.event_slug === slug ? order : null;
}

/**
 * «Marcar como revisada» una orden que quedó para revisar a mano (pago tardío sin cupo, pago
 * duplicado, venta en la puerta sin conexión): saca la marca y lo deja en Actividad
 * (`order.reviewed`), con lo que decía la marca.
 *
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ orderId: string, slug: string, bulk?: boolean }} input
 * @returns {Promise<'done' | 'already' | 'not_found'>}
 */
export async function reviewOrderFromPanel(db, locals, { orderId, slug, bulk = false }) {
	const order = await eventOrder(db, orderId, slug);
	if (!order) return 'not_found';
	const done = await clearReview(db, order.id);
	if (!done) return 'already';
	await logAdminAction(db, locals, {
		action: 'order.reviewed',
		targetType: 'order',
		targetId: order.id,
		summary:
			order.needs_review === 'duplicate_payment' && order.review_detail
				? `Marcó como revisada la orden ${orderReference(order.id)} (pago duplicado: Mercado Pago n.° ${order.review_detail})`
				: `Marcó como revisada la orden ${orderReference(order.id)}`,
		// Lo que decía la marca (en un pago duplicado, el número del otro pago) queda acá:
		// clearReview lo borra de la orden.
		detail: {
			event: slug,
			reason: order.needs_review ?? (order.offline_review ? 'door_offline' : null),
			reviewDetail: order.review_detail ?? null,
			offlineReview: order.offline_review ?? null,
			total: order.total,
			...(bulk ? { bulk: true } : {})
		}
	});
	return 'done';
}

/**
 * «Reenviar mail»: manda otra vez las entradas de una orden aprobada (sin la clave de
 * idempotencia de la primera vez) y lo deja en Actividad (`order.resend`).
 *
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ orderId: string, slug: string, origin: string, fetch: typeof fetch,
 *   bulk?: boolean }} input
 * @returns {Promise<{ result: 'not_approved' | Awaited<ReturnType<typeof sendOrderEmailResult>>,
 *   order: Order | null }>}
 */
export async function resendOrderFromPanel(db, locals, { orderId, slug, origin, fetch, bulk }) {
	const order = await eventOrder(db, orderId, slug);
	if (!order || order.status !== 'approved') return { result: 'not_approved', order: null };
	const result = await sendOrderEmailResult({ db, order, origin, fetch, idempotent: false });
	const sent = result === 'sent';
	await logAdminAction(db, locals, {
		action: 'order.resend',
		targetType: 'order',
		targetId: order.id,
		summary: sent
			? `Reenvió las entradas de ${orderReference(order.id)}`
			: `Intentó reenviar las entradas de ${orderReference(order.id)} (el mail falló)`,
		detail: { event: slug, sent, ...(bulk ? { bulk: true } : {}) }
	});
	return { result, order };
}

/**
 * Lo que manda la barra: la acción y las compras (`order`, una vez por compra). Sin repetidas y
 * a lo sumo una tanda (`bulkBatch`) por pedido.
 *
 * @param {FormData} form
 * @returns {{ ok: true, action: import('$lib/admin/orderBulk.js').BulkAction, ids: string[] }
 *   | { ok: false, message: string }}
 */
export function readBulkSelection(form) {
	const action = form.get('accion');
	if (!isBulkAction(action))
		return { ok: false, message: 'No sabemos qué hacer con esas compras.' };
	const ids = [
		...new Set(
			form
				.getAll('order')
				.map((v) => (typeof v === 'string' ? v.trim() : ''))
				.filter((v) => v && v.length <= 64)
		)
	];
	if (!ids.length) return { ok: false, message: 'No elegiste ninguna compra.' };
	if (ids.length > bulkBatch(action)) {
		return { ok: false, message: 'Son demasiadas compras de una vez: probá de nuevo.' };
	}
	return { ok: true, action, ids };
}

/**
 * Una acción de la barra sobre varias compras de este evento, una por una, con la misma función
 * que su botón. Las que no aplican (de otro evento, ya facturada, no aprobada…) se saltean con su
 * motivo ($lib/admin/orderBulk.js, `SKIP_REASONS`). Al reenviar, si Resend pide esperar (cupo o
 * tasa), se corta: las que faltan vuelven con `stopped` y la página no manda más.
 *
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ action: import('$lib/admin/orderBulk.js').BulkAction, ids: string[], slug: string,
 *   by: string, origin: string, fetch: typeof fetch, now?: number }} input
 * @returns {Promise<import('$lib/admin/orderBulk.js').BulkResult>}
 */
export async function runBulkOrders(db, locals, { action, ids, slug, by, origin, fetch, now }) {
	/** @type {string[]} */
	const done = [];
	/** @type {import('$lib/admin/orderBulk.js').Skipped[]} */
	const skipped = [];
	for (const [i, id] of ids.entries()) {
		if (action === 'facturada' || action === 'sin-facturar') {
			const invoiced = action === 'facturada';
			const r = await invoicedFromPanel(db, locals, {
				orderId: id,
				invoiced,
				by,
				eventSlug: slug,
				now,
				bulk: true
			});
			const result = r.result;
			if (result === 'done') done.push(id);
			else
				skipped.push({
					id,
					reason:
						result === 'not_found'
							? 'no-encontrada'
							: result === 'not_eligible'
								? 'sin-pago'
								: invoiced
									? 'ya-facturada'
									: 'ya-sin-facturar'
				});
		} else if (action === 'revisada') {
			const r = await reviewOrderFromPanel(db, locals, { orderId: id, slug, bulk: true });
			if (r === 'done') done.push(id);
			else skipped.push({ id, reason: r === 'not_found' ? 'no-encontrada' : 'sin-revisar' });
		} else {
			const { result } = await resendOrderFromPanel(db, locals, {
				orderId: id,
				slug,
				origin,
				fetch,
				bulk: true
			});
			if (result === 'sent') done.push(id);
			else if (result === 'not_approved') skipped.push({ id, reason: 'no-aprobada' });
			else if (result === 'quota' || result === 'rate') {
				for (const rest of ids.slice(i)) skipped.push({ id: rest, reason: 'esperar' });
				return { done, skipped, stopped: true };
			} else skipped.push({ id, reason: 'mail-fallo' });
		}
	}
	return { done, skipped, stopped: false };
}

import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getDB } from '$lib/server/db';
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	getGateway,
	inBackground,
	sendOrderEmail,
	sendRefundEmail,
	sendStreamLinkEmails,
	siteOrigin
} from '$lib/server/tickets/index.js';
import {
	cancelTransfer,
	clearReview,
	confirmTransfer,
	getOrder,
	refundOrder
} from '$lib/server/tickets/orders.js';
import { getStreamLink, normalizeStreamLink, setStreamLink } from '$lib/server/tickets/stream.js';
import { orderReference } from '$lib/utils/tickets.js';

/**
 * Acciones de la venta de entradas de un evento (antes en /admin/entradas/<slug>). Cada pestaña de
 * la ficha exporta las suyas: `export const actions = pickActions('confirm', 'cancel')`. Todas
 * llaman a `requireAdmin` (las form actions no pasan por el layout) y dejan registro con
 * `logAdminAction`.
 * @type {Record<string, import('@sveltejs/kit').Action<{ slug: string }>>}
 */
export const eventTicketActions = {
	/** Une admin ya revisó una orden marcada: se saca la marca. */
	reviewed: async ({ locals, url, params, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { review: { ok: false, message: 'Sin base de datos.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const order = await getOrder(db, orderId);
		if (!order || order.event_slug !== params.slug) {
			return fail(400, { review: { ok: false, message: 'No encontramos esa orden.' } });
		}
		const done = await clearReview(db, order.id);
		if (done) {
			await logAdminAction(db, locals, {
				action: 'order.reviewed',
				targetType: 'order',
				targetId: order.id,
				summary: `Marcó como revisada la orden ${orderReference(order.id)}`,
				detail: { event: params.slug }
			});
		}
		return {
			review: {
				ok: done,
				message: done ? 'Marcada como revisada.' : 'Esa orden ya estaba revisada.'
			}
		};
	},
	resend: async ({ locals, url, params, platform, request, fetch }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { resend: { ok: false, message: 'Sin base de datos.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const order = await getOrder(db, orderId);
		if (!order || order.event_slug !== params.slug || order.status !== 'approved') {
			return fail(400, { resend: { ok: false, message: 'Esa orden no está aprobada.' } });
		}
		const sent = await sendOrderEmail({
			db,
			order,
			origin: siteOrigin(url),
			fetch,
			idempotent: false
		});
		await logAdminAction(db, locals, {
			action: 'order.resend',
			targetType: 'order',
			targetId: order.id,
			summary: sent
				? `Reenvió las entradas de ${orderReference(order.id)}`
				: `Intentó reenviar las entradas de ${orderReference(order.id)} (el mail falló)`,
			detail: { event: params.slug, sent }
		});
		return {
			resend: {
				ok: sent,
				message: sent
					? `Reenviamos las entradas a ${order.buyer_email}.`
					: 'No se pudo mandar el email (ver logs).'
			}
		};
	},

	// "Confirmar pago" de una transferencia: aprueba, emite las entradas y manda el mail.
	// Idempotente: un segundo click no emite ni manda nada de nuevo.
	confirm: async ({ locals, url, params, platform, request, fetch }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		if (!config) return fail(404, { transfer: { ok: false, message: 'Evento no encontrado.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const order = await getOrder(db, orderId);
		const type = config.types.find((t) => t.id === order?.ticket_type);
		if (!order || !type) {
			return fail(404, { transfer: { ok: false, message: 'No encontramos esa orden.' } });
		}
		const r = await confirmTransfer(db, {
			orderId,
			eventSlug: params.slug,
			capacity: type.capacity,
			by: admin.login
		});
		const ref = orderReference(orderId);
		if (r.result === 'confirmed' && r.order) {
			const confirmed = r.order;
			await logAdminAction(db, locals, {
				action: 'transfer.confirm',
				targetType: 'order',
				targetId: orderId,
				summary: `Confirmó la transferencia ${ref} (${r.tickets.length} entradas)`,
				detail: { event: params.slug, tickets: r.tickets.length, total: confirmed.total }
			});
			await inBackground(
				sendOrderEmail({
					db,
					order: confirmed,
					tickets: r.tickets,
					origin: siteOrigin(url),
					fetch
				}),
				platform
			);
			return {
				transfer: {
					ok: true,
					message: `Pago de ${ref} confirmado: se emitieron ${r.tickets.length} entradas y se mandaron a ${confirmed.buyer_email}.`
				}
			};
		}
		/** @type {Record<string, string>} */
		const messages = {
			already: `${ref} ya estaba confirmada (no se emitió nada de nuevo).`,
			'no-capacity': `No se pudo confirmar ${ref}: la reserva venció y ya no hay cupo para ${r.order?.quantity ?? ''} entradas ${type.name}.`,
			'not-transfer': `${ref} no es una compra por transferencia.`,
			'not-found': 'No encontramos esa orden.',
			cancelled: `${ref} está cancelada: no se puede confirmar.`
		};
		if (r.result === 'already') return { transfer: { ok: true, message: messages.already } };
		return fail(409, { transfer: { ok: false, message: messages[r.result] } });
	},

	// "Link de la transmisión" (eventos online): guardar o borrar.
	setLink: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { stream: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		if (!config?.online) {
			return fail(400, { stream: { ok: false, message: 'Este evento no es online.' } });
		}
		const raw = String((await request.formData()).get('link') ?? '').slice(0, 1000);
		const r = normalizeStreamLink(raw);
		if (!r.ok) return fail(400, { stream: { ok: false, message: r.message, value: raw } });
		await setStreamLink(db, { eventSlug: params.slug, link: r.link, by: admin.login });
		// El link no se guarda en el registro (da acceso a la transmisión).
		await logAdminAction(db, locals, {
			action: r.link ? 'stream.set' : 'stream.clear',
			targetType: 'event',
			targetId: params.slug,
			summary: r.link ? 'Guardó el link de la transmisión' : 'Borró el link de la transmisión'
		});
		return {
			stream: {
				ok: true,
				message: r.link
					? 'Link guardado. Las compras nuevas lo reciben en el mail de las entradas; para quienes ya compraron, tocá "Enviar el link a todes".'
					: 'Link borrado.'
			}
		};
	},

	// "Enviar el link a todes": solo a las órdenes aprobadas que todavía no recibieron ESTE link.
	sendLink: async ({ locals, url, params, platform, fetch }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { stream: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		const current = config?.online ? await getStreamLink(db, params.slug) : null;
		if (!current) {
			return fail(400, { stream: { ok: false, message: 'Primero guardá el link.' } });
		}
		const r = await sendStreamLinkEmails({
			db,
			eventSlug: params.slug,
			link: current.link,
			origin: siteOrigin(url),
			fetch
		});
		const who = (/** @type {number} */ n) => (n === 1 ? '1 persona' : `${n} personas`);
		if (r.sent || r.failed) {
			await logAdminAction(db, locals, {
				action: 'stream.send',
				targetType: 'event',
				targetId: params.slug,
				summary: `Mandó el link de la transmisión a ${who(r.sent)}`,
				detail: { sent: r.sent, failed: r.failed }
			});
		}
		const message =
			r.sent === 0 && r.failed === 0
				? 'Todes ya tenían este link: no se mandó nada.'
				: `Link enviado a ${who(r.sent)}.` +
					(r.failed
						? ` No se pudo mandar a ${who(r.failed)} (ver logs; volvé a tocar el botón).`
						: '');
		return r.failed
			? fail(502, { stream: { ok: false, message } })
			: { stream: { ok: true, message } };
	},

	// "Reembolsar": Mercado Pago → reembolso total por la API de MP y después se marca la orden;
	// transferencia o sin cargo → solo se marca (la plata se devuelve a mano). Idempotente: una
	// orden ya reembolsada no se vuelve a reembolsar (y MP recibe la misma X-Idempotency-Key).
	refund: async ({ locals, url, params, platform, request, fetch }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { refund: { ok: false, message: 'Sin base de datos.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const order = await getOrder(db, orderId);
		const ref = orderReference(orderId);
		if (!order || order.event_slug !== params.slug) {
			return fail(404, { refund: { ok: false, message: 'No encontramos esa orden.' } });
		}
		if (order.status === 'refunded') {
			return {
				refund: { ok: true, message: `${ref} ya estaba reembolsada (no se hizo nada de nuevo).` }
			};
		}
		if (order.status !== 'approved') {
			return fail(409, {
				refund: { ok: false, message: `${ref} no está aprobada: no hay nada que reembolsar.` }
			});
		}
		if (order.payment_method === 'mercadopago') {
			const gateway = await getGateway(fetch);
			if (!gateway || !order.mp_payment_id) {
				return fail(503, {
					refund: {
						ok: false,
						message: 'Mercado Pago no está disponible (o la orden no tiene pago).'
					}
				});
			}
			try {
				await gateway.refundPayment(order.mp_payment_id, `refund-${order.id}`);
			} catch (error) {
				console.error(`[tickets] reembolso de ${order.id} rechazado por MP:`, error);
				return fail(502, {
					refund: {
						ok: false,
						message: `Mercado Pago no aceptó el reembolso de ${ref} (¿saldo insuficiente o más de 180 días?). No se cambió nada. Detalle en los logs.`
					}
				});
			}
		}
		const r = await refundOrder(db, { orderId, eventSlug: params.slug, by: admin.login });
		if (r.result === 'refunded' && r.order) {
			await logAdminAction(db, locals, {
				action: 'order.refund',
				targetType: 'order',
				targetId: orderId,
				summary: `Reembolsó ${ref}`,
				detail: {
					event: params.slug,
					method: order.payment_method,
					total: order.total
				}
			});
			await inBackground(sendRefundEmail({ db, order: r.order, fetch }), platform);
			return {
				refund: {
					ok: true,
					message: `${ref} reembolsada: se liberó el cupo, las entradas quedaron anuladas y le avisamos a ${r.order.buyer_email}.`
				}
			};
		}
		if (r.result === 'already') {
			return {
				refund: { ok: true, message: `${ref} ya estaba reembolsada (no se hizo nada de nuevo).` }
			};
		}
		return fail(409, {
			refund: { ok: false, message: `No se pudo marcar ${ref} como reembolsada.` }
		});
	},

	cancel: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const orderId = String((await request.formData()).get('order') ?? '');
		const ok = await cancelTransfer(db, { orderId, eventSlug: params.slug, by: admin.login });
		const ref = orderReference(orderId);
		if (ok) {
			await logAdminAction(db, locals, {
				action: 'transfer.cancel',
				targetType: 'order',
				targetId: orderId,
				summary: `Canceló la transferencia ${ref}`,
				detail: { event: params.slug }
			});
		}
		return ok
			? { transfer: { ok: true, message: `${ref} cancelada: se liberó el cupo.` } }
			: fail(409, { transfer: { ok: false, message: `No se pudo cancelar ${ref}.` } });
	}
};

/**
 * Las acciones de una pestaña.
 * @param {...string} names
 */
export function pickActions(...names) {
	return Object.fromEntries(names.map((n) => [n, eventTicketActions[n]]));
}

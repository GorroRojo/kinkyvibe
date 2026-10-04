import { entradas } from '$lib/utils/plural.js';
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
	siteOrigin,
	transferHoldMs
} from '$lib/server/tickets/index.js';
import { reopenTransferFromPanel } from '$lib/server/admin/transfers.js';
import { orderIdsByDni, revealOrderDni } from '$lib/server/admin/eventOrders.js';
import { dniQueryDigits } from '$lib/admin/orderFormat.js';
import {
	cancelTransfer,
	clearReview,
	confirmTransfer,
	getOrder,
	refundOrder,
	orderTier,
	transferLimits
} from '$lib/server/tickets/orders.js';
import { checkOverride, logOverride, readOverride } from '$lib/server/tickets/overrides.js';
import {
	getStreamLink,
	normalizeStreamLink,
	requestStreamLinkSend,
	setStreamLink
} from '$lib/server/tickets/stream.js';
import { orderReference } from '$lib/utils/tickets.js';
import { trackFunnel } from '$lib/server/analytics/track.js';

/**
 * Acciones de la venta de entradas de un evento (antes, una página por evento bajo Entradas). Cada pestaña de
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
	// «Mostrar» el DNI completo de una orden de este evento (en la página solo van los últimos 3
	// dígitos). Como en la ficha de la persona: cada vez queda en Actividad, sin el DNI.
	dni: async ({ locals, url, params, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		const orderId = String((await request.formData()).get('orden') ?? '').slice(0, 64);
		const key = `orden:${orderId}`;
		if (!db) return fail(503, { dni: { ok: false, key, message: 'Sin base de datos.' } });
		if (!orderId) {
			return fail(400, { dni: { ok: false, key: '', message: 'No sabemos qué DNI mostrar.' } });
		}
		const value = await revealOrderDni(db, locals, { slug: params.slug, orderId });
		if (!value) return fail(404, { dni: { ok: false, key, message: 'No hay DNI.' } });
		return { dni: { ok: true, key, value } };
	},

	// Buscador de Órdenes por DNI: el DNI completo no está en la página, así que se busca acá.
	// Devuelve solo los ids de las órdenes que coinciden (el DNI empieza con esos dígitos).
	dniSearch: async ({ locals, url, params, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		const q = dniQueryDigits((await request.formData()).get('q'));
		if (!db) return fail(503, { dniSearch: { ids: [] } });
		return { dniSearch: { ids: await orderIdsByDni(db, params.slug, q) } };
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
	// Idempotente: un segundo click no emite ni manda nada de nuevo. Si llegó tarde y los lugares
	// ya se ocuparon, pasa el cupo: contesta 409 con `needsConfirmation` y la página pregunta con
	// un diálogo; si le admin confirma, reenvía con `override` (ver tickets/overrides.js).
	confirm: async ({ locals, url, params, platform, request, fetch }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		if (!config) return fail(404, { transfer: { ok: false, message: 'Evento no encontrado.' } });
		const form = await request.formData();
		const orderId = String(form.get('order') ?? '').slice(0, 60);
		const order = await getOrder(db, orderId);
		const type = config.types.find((t) => t.id === order?.ticket_type);
		if (!order || !type || order.event_slug !== params.slug) {
			return fail(404, { transfer: { ok: false, message: 'No encontramos esa orden.' } });
		}
		const ref = orderReference(orderId);
		const now = Date.now();
		/** @param {import('$lib/server/tickets/overrides.js').NeedsConfirmation} needsConfirmation */
		const ask = (needsConfirmation) =>
			fail(409, {
				transfer: {
					ok: false,
					message: `Para confirmar ${ref} hay que pasar un límite: confirmalo en el aviso.`,
					order: orderId,
					needsConfirmation
				}
			});
		const check = checkOverride(await transferLimits(db, { order, type, now }), readOverride(form));
		if (!check.ok) return ask(check.needsConfirmation);
		const r = await confirmTransfer(db, {
			orderId,
			eventSlug: params.slug,
			capacity: type.capacity,
			tierQuantity: orderTier(order, type)?.quantity ?? null,
			by: admin.login,
			override: check.override,
			now
		});
		if (r.result === 'confirmed' && r.order) {
			const confirmed = r.order;
			trackFunnel(platform?.env, {
				slug: params.slug,
				step: 'aprobada',
				method: 'transferencia'
			});
			await logAdminAction(db, locals, {
				action: 'transfer.confirm',
				targetType: 'order',
				targetId: orderId,
				summary: `Confirmó la transferencia ${ref} (${entradas(r.tickets.length)})`,
				detail: {
					event: params.slug,
					tickets: r.tickets.length,
					total: confirmed.total,
					...(check.limits.length ? { overrides: check.limits } : {})
				}
			});
			await logOverride(db, locals, {
				event: params.slug,
				what: 'confirmación de transferencia',
				orderId,
				limits: check.limits
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
					message: `Pago de ${ref} confirmado: se emitieron ${entradas(r.tickets.length)} y se mandaron a ${confirmed.buyer_email}.`
				}
			};
		}
		/** @type {Record<string, string>} */
		const messages = {
			already: `${ref} ya estaba confirmada (no se emitió nada de nuevo).`,
			'no-capacity': `No se pudo confirmar ${ref}: la reserva venció y ya no hay cupo para ${entradas(r.order?.quantity ?? 0)} ${type.name}.`,
			'not-transfer': `${ref} no es una compra por transferencia.`,
			'not-found': 'No encontramos esa orden.',
			cancelled: `${ref} está cancelada: no se puede confirmar.`
		};
		if (r.result === 'already') return { transfer: { ok: true, message: messages.already } };
		if (r.result === 'no-capacity') {
			// Se ocupó el último lugar entre el control y la confirmación: se vuelve a preguntar.
			const again = checkOverride(await transferLimits(db, { order, type, now }), '');
			if (!again.ok) return ask(again.needsConfirmation);
		}
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
	// Manda una tanda ("de a cuántos" de Ajustes → Mails) y deja el envío pedido: el resto lo
	// manda el cron en las próximas vueltas (o otro toque del botón). También reintenta a quienes
	// habían fallado todos sus intentos.
	sendLink: async ({ locals, url, params, platform, fetch }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { stream: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		const current = config?.online ? await getStreamLink(db, params.slug) : null;
		if (!current) {
			return fail(400, { stream: { ok: false, message: 'Primero guardá el link.' } });
		}
		await requestStreamLinkSend(db, { eventSlug: params.slug, link: current.link });
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
				detail: { sent: r.sent, failed: r.failed, remaining: r.remaining }
			});
		}
		const message = streamSendMessage(r, who);
		return r.failed || r.gaveUp
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
	},

	// "Deshacer rechazo": la transferencia cancelada vuelve a esperar comprobante (misma función
	// que la bandeja general; solo órdenes de este evento). Sin lugar, pide `override`.
	reopen: async ({ locals, url, params, platform, request }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { transfer: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const orderId = String(form.get('order') ?? '').slice(0, 60);
		const r = await reopenTransferFromPanel({
			db,
			locals,
			by: admin.login,
			orderId,
			eventSlug: params.slug,
			holdMs: transferHoldMs(),
			override: readOverride(form)
		});
		const body = {
			transfer: {
				ok: r.ok,
				message: r.message,
				order: orderId,
				action: 'reopen',
				needsConfirmation: r.needsConfirmation ?? null
			}
		};
		return r.ok ? body : fail(r.status, body);
	}
};

/**
 * Las acciones de una pestaña.
 * @param {...string} names
 */
export function pickActions(...names) {
	return Object.fromEntries(names.map((n) => [n, eventTicketActions[n]]));
}

/**
 * Qué pasó con una tanda de "Enviar el link a todes", para le admin.
 *
 * @param {{ sent: number, failed: number, remaining: number, gaveUp: number }} r
 * @param {(n: number) => string} who
 */
export function streamSendMessage(r, who) {
	if (!r.sent && !r.failed && !r.remaining && !r.gaveUp) {
		return 'Todes ya tenían este link: no se mandó nada.';
	}
	const parts = [];
	if (r.sent || r.failed) parts.push(`Link enviado a ${who(r.sent)}.`);
	if (r.failed) parts.push(`No se pudo mandar a ${who(r.failed)}: se reintenta solo.`);
	if (r.remaining) {
		parts.push(
			`Faltan ${who(r.remaining)}: siguen solas en las próximas vueltas del cron (cada 15 minutos), o tocá el botón de nuevo para mandar otra tanda.`
		);
	}
	if (r.gaveUp) {
		parts.push(
			`A ${who(r.gaveUp)} no le llegó después de varios intentos (ver logs; tocá el botón para reintentar).`
		);
	}
	return parts.join(' ');
}

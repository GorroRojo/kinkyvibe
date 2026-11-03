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
	sendOrderEmailResult,
	sendDateChangeEmails,
	sendRefundEmail,
	sendStreamLinkEmails,
	siteOrigin
} from '$lib/server/tickets/index.js';
import { confirmLimits, reopenTransferFromPanel } from '$lib/server/admin/transfers.js';
import { queueWaitlistAdvance } from '$lib/server/tickets/waitlistEngine.js';
import { orderIdsByDni, revealOrderDni } from '$lib/server/admin/eventOrders.js';
import { dniQueryDigits } from '$lib/admin/orderFormat.js';
import {
	cancelTransfer,
	clearReview,
	confirmTransfer,
	getOrder,
	orderTier,
	updateBuyerEmail
} from '$lib/server/tickets/orders.js';
import { isSuppressed } from '$lib/server/email/suppressions.js';
import { normalizeBuyerEmail } from '$lib/utils/ticketBuyer.js';
import {
	REFUND_ALL_WORD,
	REFUND_REASON,
	refundAllBatch,
	refundAllCursor,
	refundAllPreview,
	refundFromPanel
} from '$lib/server/admin/refunds.js';
import { formatARS } from '$lib/utils/money.js';
import { checkOverride, logOverride, readOverride } from '$lib/server/tickets/overrides.js';
import {
	getStreamLink,
	normalizeStreamLink,
	requestStreamLinkSend,
	setStreamLink
} from '$lib/server/tickets/stream.js';
import {
	dateChangeOffer,
	dismissDateChange,
	getDateChange,
	requestDateChangeSend
} from '$lib/server/tickets/dateChange.js';
import { orderReference } from '$lib/utils/tickets.js';
import { trackFunnel } from '$lib/server/analytics/track.js';
import { queueOrderNotice } from '$lib/server/telegram/adminNotify.js';
import { MAILS_PAUSED_ADMIN_MESSAGE, logMailsPaused, mailsPaused } from '$lib/server/emergencia.js';

/**
 * Lo que sigue a un reembolso hecho desde el panel (el de una orden y cada uno de «Reembolsar
 * todas»): queda en Actividad (`order.refund`), le sale el mail «Reembolsamos tu compra» a quien
 * compró y, con `waitlist` (por defecto), la lista de espera pasa a la próxima persona.
 *
 * @param {{
 *   db: import('@cloudflare/workers-types').D1Database,
 *   locals: App.Locals,
 *   platform: Readonly<App.Platform> | undefined,
 *   url: URL,
 *   fetch: typeof fetch,
 *   before: import('$lib/server/tickets/orders.js').Order,
 *   fresh: import('$lib/server/tickets/orders.js').Order,
 *   waitlist?: boolean
 * }} input
 */
export async function afterRefund({
	db,
	locals,
	platform,
	url,
	fetch,
	before,
	fresh,
	waitlist = true
}) {
	// Cada paso por su lado: si falla la Actividad, el mail sale igual (y al revés).
	try {
		await logAdminAction(db, locals, {
			action: 'order.refund',
			targetType: 'order',
			targetId: before.id,
			summary: `Reembolsó ${orderReference(before.id)}`,
			detail: {
				event: before.event_slug,
				method: before.payment_method,
				total: before.total
			}
		});
	} catch (error) {
		console.error(`[tickets] no se pudo anotar el reembolso de ${before.id}:`, error);
	}
	try {
		await inBackground(sendRefundEmail({ db, order: fresh, fetch }), platform);
	} catch (error) {
		console.error(`[tickets] no se pudo mandar el aviso de reembolso de ${before.id}:`, error);
	}
	// Se liberó un lugar: la lista de espera pasa a la próxima persona.
	if (waitlist) {
		queueWaitlistAdvance({
			platform,
			db,
			eventSlug: before.event_slug,
			fetch,
			origin: siteOrigin(url)
		});
	}
}

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
				summary:
					order.needs_review === 'duplicate_payment' && order.review_detail
						? `Marcó como revisada la orden ${orderReference(order.id)} (pago duplicado: Mercado Pago n.° ${order.review_detail})`
						: `Marcó como revisada la orden ${orderReference(order.id)}`,
				// Lo que decía la marca (en un pago duplicado, el número del otro pago) queda acá:
				// clearReview lo borra de la orden.
				detail: {
					event: params.slug,
					reason: order.needs_review ?? (order.offline_review ? 'door_offline' : null),
					reviewDetail: order.review_detail ?? null,
					offlineReview: order.offline_review ?? null,
					total: order.total
				}
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
					? `Le pedimos a Resend que mande las entradas a ${order.buyer_email}. Si no le llegan, fijate en Resend → Suppressions si la dirección está bloqueada.`
					: 'No se pudo mandar el email (ver logs).'
			}
		};
	},

	// «Corregir el mail y reenviar»: quien compró escribió mal su dirección. Solo órdenes aprobadas
	// de este evento (pagas o gratis). Cambia `buyer_email` y manda las entradas a la dirección
	// nueva, con una clave de idempotencia propia (`tickets-<orden>` ya se usó con la otra); a la
	// vieja no le sale nada. Si la nueva dijo «No fui yo», no se cambia ni se manda: se avisa. El
	// registro de actividad no guarda ninguna de las dos direcciones.
	email: async ({ locals, url, params, platform, request, fetch }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { emailFix: { ok: false, message: 'Sin base de datos.' } });
		const form = await request.formData();
		const orderId = String(form.get('order') ?? '').slice(0, 64);
		const order = await getOrder(db, orderId);
		if (!order || order.event_slug !== params.slug || order.status !== 'approved') {
			return fail(400, {
				emailFix: { ok: false, order: orderId, message: 'Esa orden no está aprobada.' }
			});
		}
		const ref = orderReference(order.id);
		const email = normalizeBuyerEmail(form.get('email'));
		if (!email) {
			return fail(400, {
				emailFix: {
					ok: false,
					order: order.id,
					message: 'Revisá el mail nuevo: no parece un mail.'
				}
			});
		}
		if (email === order.buyer_email.trim().toLowerCase()) {
			return fail(400, {
				emailFix: {
					ok: false,
					order: order.id,
					message:
						'Es la misma dirección que ya tiene la orden. Para mandarla de nuevo, usá «Reenviar mail».'
				}
			});
		}
		if (await isSuppressed(db, email)) {
			return fail(409, {
				emailFix: {
					ok: false,
					order: order.id,
					message: `Esa dirección tocó «No fui yo» (pidió no recibir más mails de Kinky Vibe): no cambiamos ${ref} ni mandamos nada. Si es de quien compró, que te escriba desde ahí.`
				}
			});
		}
		if (!(await updateBuyerEmail(db, { orderId: order.id, eventSlug: params.slug, email }))) {
			return fail(409, {
				emailFix: { ok: false, order: order.id, message: `No se pudo corregir el mail de ${ref}.` }
			});
		}
		const now = Date.now();
		const result = await sendOrderEmailResult({
			db,
			order: { ...order, buyer_email: email, email_sent_at: null },
			origin: siteOrigin(url),
			fetch,
			idempotent: false,
			idempotencyKey: `tickets-${order.id}-mail-${now}`
		});
		await logAdminAction(db, locals, {
			action: 'order.email_change',
			targetType: 'order',
			targetId: order.id,
			summary:
				result === 'sent'
					? `Corrigió el mail de ${ref} y reenvió las entradas`
					: `Corrigió el mail de ${ref} (las entradas no salieron)`,
			detail: { event: params.slug, sent: result === 'sent' }
		});
		// Un «ahora no» de Resend (cupo, tasa o un 5xx: `resendBackoff`) acá también es que no salió.
		const outcome = result === 'sent' || result === 'simulated' ? result : 'failed';
		const messages = {
			sent: `Listo, mandamos las entradas a la dirección nueva (${email}).`,
			simulated: `Corregimos el mail de ${ref}, pero el mail no salió (preview sin EMAIL_ALLOWLIST o dev sin clave).`,
			failed: `Corregimos el mail de ${ref}, pero no se pudo mandar (ver logs). Probá con «Reenviar mail».`
		};
		const body = {
			emailFix: { ok: outcome === 'sent', order: order.id, message: messages[outcome] }
		};
		return outcome === 'failed' ? fail(502, body) : body;
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
		// Cupo / tramo de una reserva vencida y, si el evento está cancelado, «El evento está
		// cancelado.» (se puede confirmar igual; nunca se cancela ni reembolsa sola: decisión 0044).
		const found = await confirmLimits(db, { order, type, config, now });
		const check = checkOverride(found.all, readOverride(form));
		if (!check.ok) return ask(check.needsConfirmation);
		const r = await confirmTransfer(db, {
			orderId,
			eventSlug: params.slug,
			capacity: type.capacity,
			tierQuantity: orderTier(order, type)?.quantity ?? null,
			by: admin.login,
			// Pasar el cupo solo si lo confirmado incluía un límite de lugar.
			override: check.override && found.place.length > 0,
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
			// «Cada venta» por Telegram a les admins que lo prendieron (decisión 0041; nunca tira).
			await queueOrderNotice({
				db,
				platform,
				kind: 'cada_venta',
				order: confirmed,
				origin: siteOrigin(url),
				fetch
			});
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
			const again = checkOverride((await confirmLimits(db, { order, type, config, now })).all, '');
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
	// Manda una tanda ("de a cuántos" de Mensajes → Configuración) y deja el envío pedido: el resto lo
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
		// Pausa de emergencia (MAILS_PAUSED): el envío queda pedido y lo manda el cron cuando se
		// saque la pausa.
		if (mailsPaused()) {
			logMailsPaused('«Enviar el link a todes»');
			return fail(503, { stream: { ok: false, message: PAUSED_REQUESTED_MESSAGE } });
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
				detail: { sent: r.sent, failed: r.failed, remaining: r.remaining }
			});
		}
		const message = streamSendMessage(r, who);
		return r.failed || r.gaveUp
			? fail(502, { stream: { ok: false, message } })
			: { stream: { ok: true, message } };
	},

	// «Avisar a les compradores» (cambio de fecha, dateChange.js): solo a las órdenes aprobadas de
	// antes del cambio que todavía no recibieron ESTE aviso (`version` del formulario: si hubo
	// otro cambio después, no se manda y se pide mirar el nuevo). Como «Enviar el link a todes»:
	// manda una tanda y deja el envío pedido; el resto lo manda el cron. Nunca sale solo: lo pide
	// este botón, que confirma antes.
	dateChangeSend: async ({ locals, url, params, platform, request, fetch }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { dateChange: { ok: false, message: 'Sin base de datos.' } });
		const version = Number((await request.formData()).get('version'));
		const config = await getEventTickets(params.slug);
		const change = config ? await getDateChange(db, params.slug) : null;
		if (!config || !change) {
			return fail(404, {
				dateChange: { ok: false, message: 'No hay ningún cambio de fecha para avisar.' }
			});
		}
		if (config.status === 'cancelado') {
			return fail(409, {
				dateChange: { ok: false, message: 'El evento está cancelado: no se avisa la fecha.' }
			});
		}
		if (!Number.isSafeInteger(version) || version !== change.version) {
			return fail(409, {
				dateChange: {
					ok: false,
					message: 'La fecha volvió a cambiar. Revisá el aviso nuevo y volvé a tocar el botón.'
				}
			});
		}
		await requestDateChangeSend(db, { eventSlug: params.slug, version, by: admin.login });
		// Pausa de emergencia (MAILS_PAUSED): como el link, queda pedido para después de la pausa.
		if (mailsPaused()) {
			logMailsPaused('«Avisar a les compradores»');
			return fail(503, { dateChange: { ok: false, message: PAUSED_REQUESTED_MESSAGE } });
		}
		const r = await sendDateChangeEmails({
			db,
			change,
			origin: siteOrigin(url),
			fetch
		});
		const who = (/** @type {number} */ n) => (n === 1 ? '1 persona' : `${n} personas`);
		if (r.sent || r.failed) {
			// Sin mails de nadie: solo cuántos.
			await logAdminAction(db, locals, {
				action: 'event.date_change.send',
				targetType: 'event',
				targetId: params.slug,
				summary: `Avisó el cambio de fecha a ${who(r.sent)}`,
				detail: {
					version,
					sent: r.sent,
					failed: r.failed,
					remaining: r.remaining,
					from: change.old_start,
					to: change.new_start
				}
			});
		}
		const message = dateChangeSendMessage(r, who);
		return r.failed || r.gaveUp
			? fail(502, { dateChange: { ok: false, message } })
			: { dateChange: { ok: true, message } };
	},

	// «No hace falta avisar»: el aviso de arriba de la ficha deja de mostrarse para este cambio (la
	// pestaña «Mail a compradores» lo sigue ofreciendo). No manda nada.
	dateChangeDismiss: async ({ locals, url, params, platform, request }) => {
		requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { dateChange: { ok: false, message: 'Sin base de datos.' } });
		const version = Number((await request.formData()).get('version'));
		const offer = await dateChangeOffer(db, params.slug);
		if (!offer || offer.version !== version) {
			return fail(409, { dateChange: { ok: false, message: 'Ese cambio de fecha ya no está.' } });
		}
		if (await dismissDateChange(db, { eventSlug: params.slug, version })) {
			await logAdminAction(db, locals, {
				action: 'event.date_change.dismiss',
				targetType: 'event',
				targetId: params.slug,
				summary: 'Decidió no avisar el cambio de fecha',
				detail: { version }
			});
		}
		return {
			dateChange: {
				ok: true,
				message:
					'Listo, no avisamos. Si cambiás de idea, está en «Mails» → «Mandar un aviso» → «Avisar el cambio de fecha».'
			}
		};
	},

	// "Reembolsar": Mercado Pago → reembolso total por la API de MP y después se marca la orden;
	// transferencia o sin cargo → solo se marca (la plata se devuelve a mano). Idempotente: una
	// orden ya reembolsada no se vuelve a reembolsar (y MP recibe la misma X-Idempotency-Key).
	// El paso de cada orden es `refundFromPanel` (refunds.js), el mismo de «Reembolsar todas».
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
		const r = await refundFromPanel({
			db,
			order,
			by: admin.login,
			gateway: () => getGateway(fetch)
		});
		if (r.result === 'refunded' && r.order) {
			await afterRefund({ db, locals, platform, url, fetch, before: order, fresh: r.order });
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
		if (r.result === 'not-approved') {
			return fail(409, {
				refund: { ok: false, message: `${ref} no está aprobada: no hay nada que reembolsar.` }
			});
		}
		if (r.result === 'no-gateway') {
			return fail(503, {
				refund: {
					ok: false,
					message: 'Mercado Pago no está disponible (o la orden no tiene pago).'
				}
			});
		}
		if (r.result === 'mp-failed') {
			return fail(502, {
				refund: {
					ok: false,
					message: `Mercado Pago no aceptó el reembolso de ${ref} (¿saldo insuficiente o más de 180 días?). No se cambió nada. Detalle en los logs. Antes de reintentar o devolverla a mano, revisá el pago en Mercado Pago.`
				}
			});
		}
		return fail(409, {
			refund: { ok: false, message: `No se pudo marcar ${ref} como reembolsada.` }
		});
	},

	// «Reembolsar todas» (decisión 0051): solo un evento cancelado, solo admins, con la cantidad y
	// el total que vio le admin y la palabra escrita. De a REFUND_ALL_BATCH órdenes de Mercado Pago
	// por pedido, cada una con el mismo paso que «Reembolsar» (`refundFromPanel` + `afterRefund`:
	// Actividad, mail y lista de espera); las que faltan, con «Seguir» (`after`: la última vista).
	// Las de la puerta, la carga a mano o transferencia no se tocan: se devuelven a mano.
	refundAll: async ({ locals, url, params, platform, request, fetch }) => {
		const admin = requireAdmin(locals, url);
		const db = getDB(platform);
		if (!db) return fail(503, { refundAll: { ok: false, message: 'Sin base de datos.' } });
		const config = await getEventTickets(params.slug);
		if (!config || config.status !== 'cancelado') {
			return fail(409, {
				refundAll: {
					ok: false,
					message: 'Solo se puede reembolsar todo de un evento cancelado.'
				}
			});
		}
		const form = await request.formData();
		const word = String(form.get('confirm') ?? '').trim();
		if (word.toUpperCase() !== REFUND_ALL_WORD) {
			return fail(400, {
				refundAll: { ok: false, message: `Para confirmar, escribí ${REFUND_ALL_WORD}.` }
			});
		}
		const after = String(form.get('after') ?? '').trim() || null;
		if (after && !(await refundAllCursor(db, params.slug, after))) {
			// «Seguir» con una orden que no es de este evento: no se vuelve a empezar sin el control
			// de cantidad y total.
			return fail(400, {
				refundAll: {
					ok: false,
					message: 'No sabemos desde dónde seguir: recargá la página y confirmá de nuevo.'
				}
			});
		}
		if (!after) {
			// La primera tanda: tiene que ser lo mismo que vio le admin al confirmar.
			const { mp } = await refundAllPreview(db, params.slug);
			if (Number(form.get('count')) !== mp.count || Number(form.get('total')) !== mp.total) {
				return fail(409, {
					refundAll: {
						ok: false,
						message: `Las órdenes cambiaron desde que abriste la página: ahora son ${mp.count} por ${formatARS(mp.total)}. Revisá y confirmá de nuevo.`
					}
				});
			}
			if (mp.count === 0) {
				return fail(409, {
					refundAll: {
						ok: false,
						message: 'No queda ninguna orden de Mercado Pago para reembolsar.'
					}
				});
			}
		}
		const gateway = await getGateway(fetch);
		if (!gateway) {
			return fail(503, {
				refundAll: { ok: false, message: 'Mercado Pago no está disponible: no se hizo nada.' }
			});
		}
		let batch;
		try {
			batch = await refundAllBatch({
				db,
				eventSlug: params.slug,
				by: admin.login,
				gateway: async () => gateway,
				after,
				onRefunded: (fresh, before) =>
					afterRefund({ db, locals, platform, url, fetch, before, fresh, waitlist: false })
			});
		} catch (error) {
			// Solo antes de empezar (leer la tanda): cada orden tiene su propio manejo de errores.
			console.error(`[tickets] reembolsar todas ${params.slug}:`, error);
			return fail(500, {
				refundAll: {
					ok: false,
					message: 'No se pudo leer la tanda: no se hizo nada. Probá de nuevo.'
				}
			});
		}
		const results = batch.results.map((r) => ({
			id: r.id,
			reference: orderReference(r.id),
			name: r.name,
			total: r.total,
			result: r.result,
			ok: r.result === 'refunded' || r.result === 'already',
			reason: REFUND_REASON[r.result]
		}));
		const failed = results.filter((r) => !r.ok);
		console.log(
			`[tickets] reembolsar todas ${params.slug}: ${results.length - failed.length} ok, ${failed.length} sin reembolsar, faltan ${batch.remaining ?? '?'}`
		);
		await logAdminAction(db, locals, {
			action: 'event.refund_all',
			targetType: 'event',
			targetId: params.slug,
			summary: `Reembolsar todas: ${results.length - failed.length} reembolsadas${failed.length ? `, ${failed.length} sin reembolsar` : ''}${batch.remaining ? `, faltan ${batch.remaining}` : ''}`,
			detail: {
				event: params.slug,
				results: batch.results.map((r) => ({ order: r.id, total: r.total, result: r.result })),
				remaining: batch.remaining
			}
		}).catch((error) =>
			console.error(`[tickets] no se pudo anotar «Reembolsar todas» de ${params.slug}:`, error)
		);
		// Una sola vez por tanda (el evento está cancelado: la lista de espera se cierra sola).
		queueWaitlistAdvance({
			platform,
			db,
			eventSlug: params.slug,
			fetch,
			origin: siteOrigin(url)
		});
		return {
			refundAll: {
				ok: failed.length === 0,
				message: '',
				results,
				remaining: batch.remaining,
				after: batch.after
			}
		};
	},

	cancel: async ({ locals, url, params, platform, request, fetch }) => {
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
			queueWaitlistAdvance({
				platform,
				db,
				eventSlug: params.slug,
				fetch,
				origin: siteOrigin(url)
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

/**
 * Lo que ve le admin si toca «Enviar el link a todes» o «Avisar a les compradores» con los mails
 * en tanda en pausa: el envío quedó pedido y sale solo después.
 */
export const PAUSED_REQUESTED_MESSAGE = `${MAILS_PAUSED_ADMIN_MESSAGE} El envío quedó pedido: sale solo en las vueltas del cron cuando se saque la pausa.`;

/**
 * Qué pasó con una tanda de «Avisar a les compradores», para le admin.
 *
 * @param {{ sent: number, failed: number, remaining: number, gaveUp: number }} r
 * @param {(n: number) => string} who
 */
export function dateChangeSendMessage(r, who) {
	if (!r.sent && !r.failed && !r.remaining && !r.gaveUp) {
		return 'Todes ya tenían este aviso: no se mandó nada.';
	}
	const parts = [];
	if (r.sent || r.failed) parts.push(`Aviso enviado a ${who(r.sent)}.`);
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

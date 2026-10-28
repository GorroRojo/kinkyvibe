/**
 * Confirmar o cancelar una transferencia desde el panel, sin saber de antemano de qué evento es
 * (la bandeja `/admin/ventas/transferencias` junta todos). Usa las mismas funciones que la
 * página de cada evento (`confirmTransfer` y `cancelTransfer` de orders.js, idempotentes) y
 * deja el mismo registro de actividad (`transfer.confirm` / `transfer.cancel`).
 *
 * Quien llama ya hizo `requireAdmin`: acá se recibe el login de le admin.
 *
 * Una transferencia que llegó tarde (reserva vencida) cuando los lugares ya se ocuparon pasa el
 * cupo: le admin la puede confirmar igual, pero primero se contesta `needsConfirmation` (con
 * cuánto se pasa) y la página pregunta con un diálogo; si confirma, reenvía con `override` (la
 * clave de exactamente ese límite; ver tickets/overrides.js). Queda en el registro. Lo mismo si el
 * evento está cancelado («El evento está cancelado.»): se puede confirmar (la plata entró), pero
 * se pregunta antes; nunca se cancela ni se reembolsa sola (decisión 0044).
 *
 * Una transferencia rechazada (cancelada) se puede volver a "esperando comprobante" ("Deshacer
 * rechazo", `reopenTransferFromPanel`): solo si todavía hay lugar en su tipo y su tramo (y le queda
 * un uso a su código de descuento), o pasando el límite con el mismo diálogo.
 */
import { entradas } from '$lib/utils/plural.js';
import { argDeadline } from '$lib/utils/dates.js';
import { transferDeadline } from '$lib/utils/transferDeadline.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import {
	cancelTransfer,
	confirmTransfer,
	getOrder,
	orderTier,
	reopenLimits,
	reopenTransfer,
	transferLimits
} from '$lib/server/tickets/orders.js';
import { cancelledLimit, checkOverride, logOverride } from '$lib/server/tickets/overrides.js';
import { orderReference } from '$lib/utils/tickets.js';
import { queueWaitlistAdvance } from '$lib/server/tickets/waitlistEngine.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/tickets/orders.js').Order} Order */
/** @typedef {import('$lib/server/tickets/orders.js').Ticket} Ticket */

/**
 * @typedef {{ ok: boolean, status: number, message: string, order?: Order | null,
 *   tickets?: Ticket[], slug?: string,
 *   needsConfirmation?: import('$lib/server/tickets/overrides.js').NeedsConfirmation
 * }} TransferActionResult
 */

/**
 * Qué límites se pasarían al confirmar una transferencia: los de lugar (`place`: cupo y tramo de
 * una reserva vencida, `transferLimits`) y, si el evento está cancelado, «El evento está
 * cancelado.» (`all` los junta, para `checkOverride`). El de cancelado solo si la orden todavía se
 * puede confirmar: un segundo click sobre una ya confirmada no vuelve a preguntar. Al confirmar,
 * `override` solo va a `confirmTransfer` si `place` no está vacío (confirmar «evento cancelado» no
 * saltea el control del cupo). La usan la bandeja y la pestaña Transferencias del evento.
 *
 * @param {D1Database} db
 * @param {{ order: Order, type: Parameters<typeof transferLimits>[1]['type'],
 *   config: { status?: string } | null | undefined, now: number }} input
 */
export async function confirmLimits(db, { order, type, config, now }) {
	const place = await transferLimits(db, { order, type, now });
	const pending = order.status === 'awaiting_transfer' || order.status === 'expired';
	const cancelled = pending ? cancelledLimit(config) : null;
	return { place, all: cancelled ? [...place, cancelled] : place };
}

/**
 * Confirma el pago de una transferencia: aprueba, emite las entradas y registra quién. Quien
 * llama manda el mail con `sendMail` (así los tests no dependen de Resend).
 *
 * @param {{
 *   db: D1Database,
 *   locals: App.Locals,
 *   by: string,
 *   orderId: string,
 *   sendMail?: (order: Order, tickets: Ticket[]) => Promise<unknown>,
 *   override?: string,
 *   now?: number
 * }} input `override`: la clave que mandó el diálogo de confirmación (`readOverride`)
 * @returns {Promise<TransferActionResult>}
 */
export async function confirmTransferFromPanel({
	db,
	locals,
	by,
	orderId,
	sendMail,
	override = '',
	now
}) {
	const order = await getOrder(db, orderId);
	if (!order || order.payment_method !== 'transferencia') {
		return { ok: false, status: 404, message: 'No encontramos esa transferencia.' };
	}
	const ref = orderReference(order.id);
	const config = await getEventTickets(order.event_slug);
	const type = config?.types.find((t) => t.id === order.ticket_type);
	if (!type) {
		return {
			ok: false,
			status: 404,
			message: `No encontramos el tipo de entrada de ${ref} (¿el evento dejó de vender entradas?).`
		};
	}
	const at = now ?? Date.now();
	/** @param {import('$lib/server/tickets/overrides.js').NeedsConfirmation} needsConfirmation */
	const ask = (needsConfirmation) => ({
		ok: false,
		status: 409,
		message: `Para confirmar ${ref} hay que pasar un límite: confirmalo en el aviso.`,
		needsConfirmation
	});
	const limitsNow = () => confirmLimits(db, { order, type, config, now: at });
	const found = await limitsNow();
	const check = checkOverride(found.all, override);
	if (!check.ok) return ask(check.needsConfirmation);
	const r = await confirmTransfer(db, {
		orderId: order.id,
		eventSlug: order.event_slug,
		capacity: type.capacity,
		tierQuantity: orderTier(order, type)?.quantity ?? null,
		by,
		// Pasar el cupo solo si lo que se confirmó incluía un límite de lugar (confirmar «evento
		// cancelado» no saltea el control del cupo).
		override: check.override && found.place.length > 0,
		now: at
	});
	if (r.result === 'confirmed' && r.order) {
		await logAdminAction(db, locals, {
			action: 'transfer.confirm',
			targetType: 'order',
			targetId: order.id,
			summary: `Confirmó la transferencia ${ref} (${entradas(r.tickets.length)})`,
			detail: {
				event: order.event_slug,
				tickets: r.tickets.length,
				total: r.order.total,
				...(check.limits.length ? { overrides: check.limits } : {})
			}
		});
		await logOverride(db, locals, {
			event: order.event_slug,
			what: 'confirmación de transferencia',
			orderId: order.id,
			limits: check.limits
		});
		if (sendMail) await sendMail(r.order, r.tickets);
		return {
			ok: true,
			status: 200,
			slug: order.event_slug,
			order: r.order,
			tickets: r.tickets,
			message: `Pago de ${ref} confirmado: se emitieron ${entradas(r.tickets.length)} y se mandaron a ${r.order.buyer_email}.`
		};
	}
	if (r.result === 'already') {
		return {
			ok: true,
			status: 200,
			message: `${ref} ya estaba confirmada (no se emitió nada de nuevo).`
		};
	}
	if (r.result === 'no-capacity') {
		// Se ocupó el último lugar entre el control y la confirmación: se vuelve a preguntar.
		const again = checkOverride((await limitsNow()).all, '');
		if (!again.ok) return ask(again.needsConfirmation);
	}
	/** @type {Record<string, string>} */
	const messages = {
		'no-capacity': `No se pudo confirmar ${ref}: la reserva venció y ya no hay cupo para ${entradas(order.quantity)} ${type.name}.`,
		'not-transfer': `${ref} no es una compra por transferencia.`,
		'not-found': 'No encontramos esa orden.',
		cancelled: `${ref} está cancelada: no se puede confirmar.`
	};
	return { ok: false, status: 409, message: messages[r.result] ?? `No se pudo confirmar ${ref}.` };
}

/**
 * Cancela una transferencia que no llegó (libera el cupo y el uso del código) y empuja la lista
 * de espera del evento (`queueWaitlistAdvance`, en segundo plano).
 *
 * @param {{ db: D1Database, locals: App.Locals, by: string, orderId: string, now?: number,
 *   platform?: App.Platform, fetch?: typeof fetch, origin?: string }} input
 *   `platform`, `fetch`, `origin`: para el empujón de la lista de espera (y sus mails)
 * @returns {Promise<TransferActionResult>}
 */
export async function cancelTransferFromPanel({
	db,
	locals,
	by,
	orderId,
	now,
	platform,
	fetch: fetchFn,
	origin
}) {
	const order = await getOrder(db, orderId);
	if (!order || order.payment_method !== 'transferencia') {
		return { ok: false, status: 404, message: 'No encontramos esa transferencia.' };
	}
	const ref = orderReference(order.id);
	const ok = await cancelTransfer(db, {
		orderId: order.id,
		eventSlug: order.event_slug,
		by,
		...(now ? { now } : {})
	});
	if (!ok) return { ok: false, status: 409, message: `No se pudo cancelar ${ref}.` };
	await logAdminAction(db, locals, {
		action: 'transfer.cancel',
		targetType: 'order',
		targetId: order.id,
		summary: `Canceló la transferencia ${ref}`,
		detail: { event: order.event_slug }
	});
	queueWaitlistAdvance({ platform, db, eventSlug: order.event_slug, fetch: fetchFn, origin });
	return { ok: true, status: 200, message: `${ref} cancelada: se liberó el cupo.` };
}

/**
 * "Deshacer rechazo": vuelve una transferencia cancelada a "esperando comprobante", con una
 * reserva nueva contada desde ahora con la misma regla que una compra (`transferDeadline`: 2 días
 * hábiles después de hoy, o hasta que empiece el evento si es antes; decisión 0031). Solo si
 * todavía hay lugar en su tipo de entrada y en su tramo de preventa; si no, contesta
 * `needsConfirmation` (cuánto se pasa) para el mismo diálogo que confirmar una transferencia
 * tardía. Registra `transfer.reopen` (y `tickets.override` si se pasó un límite). No le manda
 * nada a quien compró.
 *
 * @param {{
 *   db: D1Database,
 *   locals: App.Locals,
 *   by: string,
 *   orderId: string,
 *   eventSlug?: string,
 *   override?: string,
 *   now?: number
 * }} input `eventSlug`: desde la ficha de un evento, la orden tiene que ser de ese evento
 * @returns {Promise<TransferActionResult>}
 */
export async function reopenTransferFromPanel({
	db,
	locals,
	by,
	orderId,
	eventSlug,
	override = '',
	now
}) {
	const order = await getOrder(db, orderId);
	if (
		!order ||
		order.payment_method !== 'transferencia' ||
		(eventSlug && order.event_slug !== eventSlug)
	) {
		return { ok: false, status: 404, message: 'No encontramos esa transferencia.' };
	}
	const ref = orderReference(order.id);
	const config = await getEventTickets(order.event_slug);
	const type = config?.types.find((t) => t.id === order.ticket_type);
	if (!type) {
		return {
			ok: false,
			status: 404,
			message: `No encontramos el tipo de entrada de ${ref} (¿el evento dejó de vender entradas?).`
		};
	}
	const at = now ?? Date.now();
	/** @param {import('$lib/server/tickets/overrides.js').NeedsConfirmation} needsConfirmation */
	const ask = (needsConfirmation) => ({
		ok: false,
		status: 409,
		message: `${
			needsConfirmation.limits.every((l) => l.kind === 'discount_uses')
				? `No se puede volver a reservar ${ref} con su código`
				: `No hay lugar para volver a reservar ${ref}`
		}: ${needsConfirmation.limits
			.map((l) => l.message)
			.join(' ')} Podés deshacer el rechazo igual confirmándolo en el aviso.`,
		needsConfirmation
	});
	const holdMs = transferDeadline(at, config?.start ?? null) - at;
	const check = checkOverride(await reopenLimits(db, { order, type, now: at }), override);
	if (!check.ok) return ask(check.needsConfirmation);
	const r = await reopenTransfer(db, {
		orderId: order.id,
		eventSlug: order.event_slug,
		capacity: type.capacity,
		tierQuantity: orderTier(order, type)?.quantity ?? null,
		by,
		holdMs,
		override: check.override,
		now: at
	});
	if (r.result === 'reopened' && r.order) {
		await logAdminAction(db, locals, {
			action: 'transfer.reopen',
			targetType: 'order',
			targetId: order.id,
			summary: `Deshizo el rechazo de la transferencia ${ref} (vuelve a esperar comprobante)`,
			detail: {
				event: order.event_slug,
				quantity: order.quantity,
				expiresAt: r.order.expires_at,
				...(check.limits.length ? { overrides: check.limits } : {})
			}
		});
		await logOverride(db, locals, {
			event: order.event_slug,
			what: 'deshacer el rechazo de una transferencia',
			orderId: order.id,
			limits: check.limits
		});
		return {
			ok: true,
			status: 200,
			slug: order.event_slug,
			order: r.order,
			message: `${ref} vuelve a esperar el comprobante, reservada hasta el ${argDeadline(r.order.expires_at)}.`
		};
	}
	if (r.result === 'already') {
		return { ok: true, status: 200, message: `${ref} ya estaba esperando el comprobante.` };
	}
	if (r.result === 'no-capacity') {
		// Se ocupó el último lugar entre el control y el cambio: se vuelve a preguntar.
		const again = checkOverride(await reopenLimits(db, { order, type, now: at }), '');
		if (!again.ok) return ask(again.needsConfirmation);
	}
	/** @type {Record<string, string>} */
	const messages = {
		'no-capacity': `No se pudo deshacer el rechazo de ${ref}: ya no hay lugar para ${entradas(order.quantity)} ${type.name}.`,
		'not-transfer': `${ref} no es una compra por transferencia.`,
		'not-found': 'No encontramos esa orden.',
		'not-cancelled': `${ref} no está rechazada: no hay nada que deshacer.`
	};
	return {
		ok: false,
		status: 409,
		message: messages[r.result] ?? `No se pudo deshacer el rechazo de ${ref}.`
	};
}

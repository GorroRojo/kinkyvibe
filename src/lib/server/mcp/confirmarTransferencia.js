/**
 * `confirmar_transferencia`, la única excepción de plata del conector de Claude (gorrite, 26/11;
 * docs/conector-claude.md, «Confirmar una transferencia»): confirmar que llegó el pago de una
 * transferencia, con los mismos controles que «Confirmar pago» del panel. Nada más: ni
 * reembolsos, ni cancelar, ni cambiar montos, ni deshacer un rechazo, ni órdenes de Mercado Pago o
 * PayPal.
 *
 * - Va en los dos pasos de siempre (./edicion.js): `vista_previa` no guarda nada y muestra la
 *   referencia, quién compró, el tipo y la cantidad, el monto exacto a transferir (`orderPaid`, lo
 *   mismo que dice el mail «Datos para transferir» y la bandeja del panel: entradas con el aporte al
 *   Fondo y los recargos, más los extras), hasta cuándo se guardaba el lugar y si venció. Cada
 *   límite que miraría el panel (`confirmLimits`) vuelve como aviso.
 * - `aplicar` corre `confirmTransferPayment` (src/lib/server/admin/transfers.js), la misma función
 *   que el botón del panel: `confirmTransfer`, las entradas, el mail, el embudo, el aviso por
 *   Telegram y Actividad. Sin `override`: **nunca pasa un límite**. Si hay que pasar uno, no
 *   confirma y manda al panel.
 * - Solo transferencias esperando el pago, o vencidas que todavía entran sin pasar un límite. Una
 *   ya confirmada da `aplicado: false` con `motivo: "ya estaba"` y no manda nada (dos `aplicar` a
 *   la vez: el UPDATE condicional de `confirmTransfer` deja pasar uno solo).
 */
import { eventHref } from '$lib/admin/nav.js';
import { PAYMENT_METHOD } from '$lib/admin/orderFormat.js';
import { confirmLimits, confirmTransferPayment } from '$lib/server/admin/transfers.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { getOrder } from '$lib/server/tickets/orders.js';
import { limitMessage } from '$lib/server/tickets/overrides.js';
import { argDeadline } from '$lib/utils/dates.js';
import { orderPaid } from '$lib/utils/extras.js';
import { formatARS } from '$lib/utils/money.js';
import { orderReference } from '$lib/utils/tickets.js';
import { claudeLabel } from './cambios.js';
import { ToolInputError, resolveEvent } from './tools.js';

/** @typedef {import('./tools.js').ToolContext} ToolContext */
/** @typedef {import('./tools.js').ToolOutput} ToolOutput */

/** El nombre de la operación. */
export const TRANSFER_OPERATION = 'confirmar_transferencia';

/** El `motivo` de `aplicar` cuando habría que pasar un límite. */
export const LIMIT_REASON = 'hay que pasar un límite: confirmalo en el panel';

/** El `motivo` de `aplicar` cuando la orden ya estaba confirmada. */
export const ALREADY_REASON = 'ya estaba';

/** Estados de una orden que no se confirman, como los dice el panel. */
const BLOCKED_STATUS = /** @type {Record<string, { motivo: string, texto: string }>} */ ({
	cancelled: {
		motivo: 'cancelada',
		texto:
			'está cancelada (se rechazó): no se confirma desde el conector. Si el pago llegó, deshacé el rechazo en el panel.'
	},
	refunded: { motivo: 'reembolsada', texto: 'está reembolsada: no se confirma.' },
	rejected: { motivo: 'rechazada', texto: 'está rechazada: no se confirma.' }
});

/** Id completo de una orden o referencia («KV-1A2B3C4D», «kv 1a2b3c4d» o los 8 caracteres). */
const FULL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^(?:KV[-\s]?)?([0-9a-f]{8})$/i;

/**
 * @typedef {{
 *   order: import('$lib/server/tickets/orders.js').Order,
 *   eventTitle: string,
 *   reference: string,
 *   already: boolean,
 *   blocked: { motivo: string, mensaje: string } | null,
 *   limits: string[],
 *   preview: Record<string, unknown>
 * }} TransferPlan
 */

/**
 * El evento por slug o nombre, como `ventas` (y `crear_codigo`).
 * @param {string} query
 */
async function findEvent(query) {
	const r = await resolveEvent(query);
	if (r.event) return r.event;
	throw new ToolInputError(
		r.options?.length
			? `Hay varios eventos que coinciden con «${query}»: ${r.options
					.map((o) => `${o.titulo} (${o.slug})`)
					.join(', ')}. Volvé a pedir con el slug.`
			: `No encontré ningún evento «${query}».`
	);
}

/**
 * La orden de ese evento por su id o su referencia. Una referencia que coincide con más de una
 * orden del evento no se adivina.
 * @param {ToolContext} ctx
 * @param {{ slug: string, title: string }} event
 * @param {string} query
 */
async function findOrder(ctx, event, query) {
	if (!query)
		throw new ToolInputError(
			'Falta `orden`: la referencia de la compra (KV- y 8 letras o números, como en el mail) o el id de la orden.'
		);
	const panel = `${ctx.origin}${eventHref(event.slug, 'ordenes')}`;
	const notFound = () =>
		new ToolInputError(
			`No encontré la orden «${query}» en «${event.title}». Fijate la referencia con \`ventas\` (estado: pendientes).`
		);
	if (FULL_ID.test(query)) {
		const order = await getOrder(ctx.db, query.toLowerCase());
		if (!order || order.event_slug !== event.slug) throw notFound();
		return order;
	}
	const m = REFERENCE.exec(query);
	if (!m)
		throw new ToolInputError(
			'`orden` es la referencia de la compra (KV- y 8 letras o números, como en el mail) o el id de la orden.'
		);
	const { results } = await ctx.db
		.prepare('SELECT id FROM orders WHERE event_slug = ?1 AND lower(substr(id, 1, 8)) = ?2 LIMIT 2')
		.bind(event.slug, m[1].toLowerCase())
		.all();
	if (!results.length) throw notFound();
	if (results.length > 1)
		throw new ToolInputError(
			`La referencia KV-${m[1].toUpperCase()} coincide con más de una orden de «${event.title}»: confirmala en el panel (${panel}).`
		);
	const order = await getOrder(ctx.db, String(results[0].id));
	if (!order) throw notFound();
	return order;
}

/**
 * Lo que haría `confirmar_transferencia`, sin guardar nada: el plan para ./edicion.js (con la
 * misma forma que los demás) y, en `transfer`, lo propio de esta operación.
 *
 * @param {ToolContext} ctx
 * @param {Record<string, unknown>} args
 */
export async function planTransferConfirm(ctx, args) {
	const eventQuery = typeof args.evento === 'string' ? args.evento.trim().slice(0, 200) : '';
	if (!eventQuery) throw new ToolInputError('Falta `evento` (slug o nombre).');
	const event = await findEvent(eventQuery);
	const orderQuery = typeof args.orden === 'string' ? args.orden.trim().slice(0, 80) : '';
	const order = await findOrder(ctx, event, orderQuery);
	const ref = orderReference(order.id);
	const panelPath = eventHref(event.slug, 'ordenes');
	const panelUrl = `${ctx.origin}${panelPath}`;
	const config = await getEventTickets(event.slug);
	const type = config?.types.find((t) => t.id === order.ticket_type) ?? null;
	const expired = order.status === 'expired' || order.expires_at <= ctx.now;
	const pending = order.status === 'awaiting_transfer' || order.status === 'expired';

	/** @type {{ motivo: string, mensaje: string } | null} */
	let blocked = null;
	if (order.payment_method !== 'transferencia') {
		blocked = {
			motivo: 'no es transferencia',
			mensaje: `${ref} no es una transferencia (se pagó con ${PAYMENT_METHOD[order.payment_method] ?? order.payment_method}). El conector solo confirma transferencias.`
		};
	} else if (order.status !== 'approved' && !pending) {
		const b = BLOCKED_STATUS[order.status] ?? {
			motivo: 'no está pendiente',
			texto: 'no está esperando el pago: no se confirma.'
		};
		blocked = { motivo: b.motivo, mensaje: `${ref} ${b.texto}` };
	} else if (!type) {
		blocked = {
			motivo: 'sin tipo de entrada',
			mensaje: `No encontré el tipo de entrada de ${ref} (¿el evento dejó de vender entradas?). Miralo en el panel: ${panelUrl}`
		};
	}
	const already = !blocked && order.status === 'approved';

	// Los límites, con el mismo control que el panel (cupo o tramo de una vencida, evento cancelado).
	const limits =
		!blocked && !already && type
			? (await confirmLimits(ctx.db, { order, type, config, now: ctx.now })).all.map(limitMessage)
			: [];
	const amount = orderPaid(order);
	const deadline = argDeadline(order.expires_at);
	const typeName = type?.name ?? order.ticket_type;

	/** @type {string[]} */
	const warnings = [];
	if (expired && pending && !limits.length)
		warnings.push(`La reserva venció el ${deadline}, pero todavía hay lugar: se puede confirmar.`);
	warnings.push(...limits);
	if (limits.length)
		warnings.push(
			`Para confirmar ${ref} hay que pasar un límite, y el conector nunca pasa límites: no se va a confirmar desde acá. Confirmalo en el panel: ${panelUrl}`
		);

	/** @type {TransferPlan} */
	const transfer = {
		order,
		eventTitle: event.title,
		reference: ref,
		already,
		blocked,
		limits,
		preview: {
			referencia: ref,
			nombre: order.buyer_name,
			tipo: typeName,
			cantidad: order.quantity,
			monto_a_transferir: amount,
			monto_a_transferir_texto: formatARS(amount),
			vence: new Date(order.expires_at).toISOString(),
			vence_texto: deadline,
			vencida: expired,
			se_puede_confirmar: !blocked && !already && !limits.length
		}
	};

	return {
		operation: TRANSFER_OPERATION,
		head: `Confirmar el pago de la transferencia ${ref} de «${event.title}»:`,
		target: `${event.slug}:${ref}`,
		targetTitle: ref,
		targetLog: { targetType: 'order', targetId: order.id },
		inputs: { evento: event.slug, orden: order.id },
		// La versión de la orden: si cambia algo (otra confirmación, una edición, el vencimiento que
		// marca el cron), `aplicar` no sigue.
		base: `${order.status}:${order.updated_at}`,
		changes: [
			{
				campo: 'Compra',
				antes: '',
				despues: `${order.buyer_name}: ${order.quantity} × ${typeName}`
			},
			{ campo: 'Monto a transferir', antes: '', despues: formatARS(amount) },
			{
				campo: 'Reserva',
				antes: '',
				despues: expired ? `venció el ${deadline}` : `hasta el ${deadline}`
			},
			{
				campo: 'Estado',
				antes: expired ? 'vencida' : 'espera transferencia',
				despues: 'aprobada: se emiten las entradas y le llegan por mail'
			}
		],
		warnings,
		links: { panel: panelPath },
		transfer,
		/** @returns {Promise<import('./edicion.js').ApplyResult>} */
		apply: async () => ({
			ok: false,
			stale: false,
			message: 'Esta operación se aplica con `applyTransferConfirm`.'
		})
	};
}

/**
 * `vista_previa`: una orden ya confirmada o que no se puede confirmar no tiene vista previa.
 * @param {TransferPlan} t
 */
export function checkTransferPreview(t) {
	if (t.already)
		throw new ToolInputError(`${t.reference} ya estaba confirmada: no hay nada para confirmar.`);
	if (t.blocked) throw new ToolInputError(t.blocked.mensaje);
}

/**
 * @typedef {(why: string, message: string, extra?: Record<string, unknown>) => ToolOutput} Refuse
 */

/**
 * `aplicar`, antes de mirar la huella: una ya confirmada («ya estaba», sin mandar nada) o una que
 * no se puede confirmar. `null` si sigue.
 *
 * @param {TransferPlan} t
 * @param {{ who: string, refused: Refuse, log: Record<string, unknown> }} input
 * @returns {ToolOutput | null}
 */
export function transferEarlyResult(t, { who, refused, log }) {
	if (t.already) return alreadyResult(t, { who, log });
	if (t.blocked) return refused(t.blocked.motivo, t.blocked.mensaje);
	return null;
}

/**
 * «Ya estaba»: no es un error (es idempotente) y no se mandó nada.
 * @param {TransferPlan} t
 * @param {{ who: string, log: Record<string, unknown> }} input
 * @returns {ToolOutput}
 */
function alreadyResult(t, { who, log }) {
	return {
		result: {
			aplicado: false,
			motivo: ALREADY_REASON,
			mensaje: `${t.reference} ya estaba confirmada: no se emitió ni se mandó nada de nuevo.`
		},
		log: {
			summary: `${who}: no confirmó la transferencia ${t.reference} de «${t.eventTitle}» (ya estaba)`,
			...log,
			detail: { operacion: TRANSFER_OPERATION, motivo: ALREADY_REASON }
		}
	};
}

/**
 * `aplicar`, con la huella y la versión ya controladas: confirma por la misma función que el
 * panel, sin `override`.
 *
 * @param {ToolContext} ctx
 * @param {import('./edicion.js').Plan & { transfer: TransferPlan }} p
 * @param {{ confirmedBy: string | null, request: string | null, who: string, refused: Refuse,
 *   summary: string }} input
 * @returns {Promise<ToolOutput>}
 */
export async function applyTransferConfirm(
	ctx,
	p,
	{ confirmedBy, request, who, refused, summary }
) {
	const t = p.transfer;
	const panelUrl = `${ctx.origin}${p.links.panel}`;
	const limitRefusal = () =>
		refused(
			LIMIT_REASON,
			`Para confirmar ${t.reference} hay que pasar un límite (${t.limits.join(' ') || 'el cupo cambió'}), y el conector nunca pasa límites. No se confirmó nada: confirmalo en el panel: ${panelUrl}`,
			{ enlaces: p.links }
		);
	if (t.limits.length) return limitRefusal();
	const r = await confirmTransferPayment({
		db: ctx.db,
		locals: { user: ctx.user },
		by: `${claudeLabel(confirmedBy)} (@${ctx.user.login})`,
		orderId: t.order.id,
		eventSlug: t.order.event_slug,
		now: ctx.now,
		platform: ctx.platform,
		fetch: ctx.fetch,
		origin: ctx.origin,
		via: {
			summary: `desde el conector (${who})`,
			detail: {
				origen: 'conector',
				confirmado_por: confirmedBy,
				// Sin el texto del pedido (puede tener datos de alguien): solo su largo, como los demás
				// cambios del conector.
				pedido_largo: request ? request.length : 0
			}
		}
	});
	if (r.outcome === 'already') return alreadyResult(t, { who, log: p.targetLog });
	if (r.outcome === 'limits') return limitRefusal();
	if (!r.ok || r.outcome !== 'confirmed')
		return refused('el panel no lo confirmó', `No se confirmó: ${r.message}`);
	return {
		result: {
			aplicado: true,
			operacion: p.operation,
			objetivo: p.target,
			titulo: p.targetTitle,
			resumen: summary,
			mensaje: `Pago de ${t.reference} confirmado: se emitieron las entradas (${r.tickets?.length ?? 0}) y le llegan por mail a quien compró.`,
			avisos: [],
			confirmado_por: confirmedBy,
			enlaces: p.links
		},
		log: {
			summary: `${who}: confirmó la transferencia ${t.reference} de «${t.eventTitle}»`,
			...p.targetLog,
			detail: {
				operacion: p.operation,
				aplicado: true,
				campos: p.changes.map((c) => c.campo),
				confirmado_por: confirmedBy,
				pedido_largo: request ? request.length : 0
			}
		}
	};
}

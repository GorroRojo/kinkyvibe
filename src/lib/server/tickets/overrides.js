/**
 * Pasar límites de entradas desde el panel (decisión de gorrite: "la producción de un evento es
 * caótica y el sistema tiene que ser versátil"). Une admin puede vender en la puerta, confirmar
 * una transferencia o cargar entradas a mano aunque se pase del cupo, del máximo por compra, de
 * la venta cerrada o de un evento "Solo anticipadas", pero:
 *
 * 1. el servidor calcula qué límites se pasarían (`capacityLimit`, `maxPerPurchaseLimit`,
 *    `closedLimit`, `noDoorLimit`);
 * 2. si se pasa alguno y el pedido no trae la confirmación, contesta "hace falta confirmar" con
 *    la lista de límites y una clave (`checkOverride` → `needsConfirmation`); la página muestra
 *    un diálogo y, si la persona confirma, reenvía el formulario con `override=<clave>`;
 * 3. la clave describe exactamente lo que se pasa (tipo, cupo, cuántas quedarían…): si algo
 *    cambió entre el diálogo y la confirmación (se vendió otra entrada), vuelve a preguntar;
 * 4. cada vez que se pasa un límite queda en el registro de actividad (`logOverride`): cuál y
 *    por cuánto.
 *
 * La compra pública nunca pasa por acá: `override` solo lo leen acciones del panel que ya
 * pidieron `requireAdmin`, y las funciones de orders.js / door.js solo saltean un límite si se
 * les pasa `override: true` desde el servidor.
 */
import { logAdminAction } from '$lib/server/admin/audit.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Un límite que se pasaría.
 *
 * - `capacity`: cupo del tipo. `before`: entradas que ya cuentan (aprobadas y reservas
 *   vigentes); `after`: con esta operación; `over`: cuántas de más.
 * - `max_per_purchase`: máximo de entradas por compra (o por venta en la puerta).
 * - `closed`: la venta está cerrada (`reason`: `closed` por horario, `type_closed` si cerró el
 *   tipo, `soldout` si el evento está marcado como agotado, `cancelled` si está cancelado).
 * - `no_door`: el evento es "Solo anticipadas" (`puerta: false`).
 * - `tier`: cantidad de un tramo de preventa (al confirmar una transferencia vencida cuyo tramo se
 *   llenó mientras tanto). Mismos campos que `capacity`, más el tramo.
 * - `discount_uses`: usos de un código de descuento (al deshacer el rechazo de una transferencia
 *   con código, si mientras estuvo rechazada se usaron los que quedaban). `before`: usos que ya
 *   cuentan; `after`: con esta orden; `over`: cuántos de más.
 * - `not_active`: el tipo está encadenado y todavía no se habilitó (`after`: se habilita cuando se
 *   agote o cierre `afterName`).
 *
 * @typedef {{ kind: 'capacity', type: string, typeName: string, capacity: number,
 *     before: number, after: number, over: number }
 *   | { kind: 'max_per_purchase', max: number, quantity: number, over: number }
 *   | { kind: 'closed', reason: 'closed' | 'type_closed' | 'soldout' | 'cancelled',
 *     typeName?: string }
 *   | { kind: 'no_door' }
 *   | { kind: 'tier', type: string, typeName: string, tier: string, tierName: string,
 *     quantity: number, before: number, after: number, over: number }
 *   | { kind: 'discount_uses', code: string, maxUses: number, before: number, after: number,
 *     over: number }
 *   | { kind: 'not_active', type: string, typeName: string, afterName: string }} ExceededLimit
 */

/**
 * ¿Se pasa el cupo del tipo? `null` si no (o si el tipo no tiene cupo).
 *
 * @param {{ id: string, name: string, capacity: number | null }} type
 * @param {number} taken entradas que ya cuentan (aprobadas + reservas vigentes)
 * @param {number} quantity las de esta operación
 * @returns {ExceededLimit | null}
 */
export function capacityLimit(type, taken, quantity) {
	if (type.capacity === null || type.capacity === undefined) return null;
	const after = taken + quantity;
	if (after <= type.capacity) return null;
	return {
		kind: 'capacity',
		type: type.id,
		typeName: type.name,
		capacity: type.capacity,
		before: taken,
		after,
		over: after - type.capacity
	};
}

/**
 * ¿Se pasa la cantidad de un tramo de preventa? `null` si no (o si el tramo no tiene cantidad).
 *
 * @param {{ id: string, name: string }} type
 * @param {{ id: string, name: string, quantity: number | null }} tier
 * @param {number} taken entradas del tramo que ya cuentan (aprobadas + reservas vigentes)
 * @param {number} quantity las de esta operación
 * @returns {ExceededLimit | null}
 */
export function tierLimit(type, tier, taken, quantity) {
	if (tier.quantity === null || tier.quantity === undefined) return null;
	const after = taken + quantity;
	if (after <= tier.quantity) return null;
	return {
		kind: 'tier',
		type: type.id,
		typeName: type.name,
		tier: tier.id,
		tierName: tier.name,
		quantity: tier.quantity,
		before: taken,
		after,
		over: after - tier.quantity
	};
}

/**
 * ¿Se pasa de los usos de un código de descuento? `null` si no (o si el código no tiene máximo).
 *
 * @param {string} code
 * @param {number | null | undefined} maxUses
 * @param {number} uses usos que ya cuentan (aprobadas + reservas vigentes)
 * @returns {ExceededLimit | null}
 */
export function discountUsesLimit(code, maxUses, uses) {
	if (maxUses === null || maxUses === undefined) return null;
	const after = uses + 1;
	if (after <= maxUses) return null;
	return { kind: 'discount_uses', code, maxUses, before: uses, after, over: after - maxUses };
}

/**
 * Tipo encadenado que todavía no se habilitó (el anterior sigue a la venta).
 *
 * @param {{ id: string, name: string }} type
 * @param {{ name: string } | null | undefined} waitingFor el tipo anterior, si todavía se vende
 * @returns {ExceededLimit | null}
 */
export function notActiveLimit(type, waitingFor) {
	return waitingFor
		? { kind: 'not_active', type: type.id, typeName: type.name, afterName: waitingFor.name }
		: null;
}

/**
 * @param {number} quantity
 * @param {number} max
 * @returns {ExceededLimit | null}
 */
export function maxPerPurchaseLimit(quantity, max) {
	return quantity > max ? { kind: 'max_per_purchase', max, quantity, over: quantity - max } : null;
}

/**
 * Venta cerrada, según `salesState` / `typeOpen` de config.js (se pasan ya calculados para no
 * depender del reloj acá). "Todavía no abrió" no cuenta: cargar invitaciones antes de abrir la
 * venta es normal.
 *
 * @param {{ open: true } | { open: false, reason: string }} state `salesState(config, now)`
 * @param {{ name: string } | null} [closedType] el tipo, si su venta cerró por su cuenta
 * @returns {ExceededLimit | null}
 */
export function closedLimit(state, closedType = null) {
	if (!state.open) {
		if (state.reason === 'cancelled') return { kind: 'closed', reason: 'cancelled' };
		if (state.reason === 'soldout') return { kind: 'closed', reason: 'soldout' };
		if (state.reason === 'closed') return { kind: 'closed', reason: 'closed' };
	}
	if (closedType) return { kind: 'closed', reason: 'type_closed', typeName: closedType.name };
	return null;
}

/**
 * Evento "Solo anticipadas" (`puerta: false`).
 * @param {{ door?: { on: boolean } | null } | null | undefined} config
 * @returns {ExceededLimit | null}
 */
export function noDoorLimit(config) {
	return config?.door?.on === false ? { kind: 'no_door' } : null;
}

/** @param {number} n */
const plural = (n) => (n === 1 ? '1 entrada' : `${n} entradas`);

/**
 * Texto para el diálogo de confirmación.
 * @param {ExceededLimit} limit
 */
export function limitMessage(limit) {
	switch (limit.kind) {
		case 'capacity':
			return limit.before >= limit.capacity
				? `El cupo de «${limit.typeName}» ya está completo (${limit.before} / ${limit.capacity}): quedarían ${limit.after} / ${limit.capacity}, ${plural(limit.over)} de más.`
				: `Se pasa del cupo de «${limit.typeName}»: quedarían ${limit.after} / ${limit.capacity}, ${plural(limit.over)} de más.`;
		case 'max_per_purchase':
			return `Son ${limit.quantity} entradas y el máximo por compra es ${limit.max} (${limit.over} de más).`;
		case 'closed':
			if (limit.reason === 'cancelled') return 'El evento está cancelado.';
			if (limit.reason === 'soldout') return 'El evento está marcado como «Agotadas».';
			if (limit.reason === 'type_closed') return `La venta de «${limit.typeName}» ya cerró.`;
			return 'La venta de entradas ya cerró.';
		case 'no_door':
			return 'Este evento es solo anticipadas: no tiene entradas en la puerta.';
		case 'tier':
			return limit.before >= limit.quantity
				? `El tramo «${limit.tierName}» de «${limit.typeName}» ya está completo (${limit.before} / ${limit.quantity}): quedarían ${limit.after} / ${limit.quantity}, ${plural(limit.over)} de más a ese precio.`
				: `Se pasa del tramo «${limit.tierName}» de «${limit.typeName}»: quedarían ${limit.after} / ${limit.quantity}, ${plural(limit.over)} de más a ese precio.`;
		case 'discount_uses':
			return `El código ${limit.code} ya se usó ${limit.before} de ${limit.maxUses} veces: quedaría en ${limit.after} / ${limit.maxUses}.`;
		case 'not_active':
			return `«${limit.typeName}» todavía no se habilitó: se habilita cuando se agote o cierre «${limit.afterName}».`;
	}
}

/**
 * Resumen corto para el registro de actividad ("cupo de «General» +2 (52 / 50)").
 * @param {ExceededLimit} limit
 */
export function limitSummary(limit) {
	switch (limit.kind) {
		case 'capacity':
			return `cupo de «${limit.typeName}» +${limit.over} (${limit.after} / ${limit.capacity})`;
		case 'max_per_purchase':
			return `máximo por compra +${limit.over} (${limit.quantity} / ${limit.max})`;
		case 'closed':
			if (limit.reason === 'cancelled') return 'evento cancelado';
			if (limit.reason === 'soldout') return 'evento marcado como «Agotadas»';
			if (limit.reason === 'type_closed') return `venta de «${limit.typeName}» cerrada`;
			return 'venta cerrada';
		case 'no_door':
			return 'evento solo anticipadas';
		case 'tier':
			return `tramo «${limit.tierName}» de «${limit.typeName}» +${limit.over} (${limit.after} / ${limit.quantity})`;
		case 'discount_uses':
			return `usos del código ${limit.code} +${limit.over} (${limit.after} / ${limit.maxUses})`;
		case 'not_active':
			return `«${limit.typeName}» antes de habilitarse`;
	}
}

/**
 * Clave estable de un conjunto de límites: la confirmación vale solo para exactamente esto.
 * @param {ExceededLimit[]} limits
 */
export function overrideKey(limits) {
	return limits
		.map((l) => {
			switch (l.kind) {
				case 'capacity':
					return `capacity:${l.type}:${l.after}/${l.capacity}`;
				case 'max_per_purchase':
					return `max:${l.quantity}/${l.max}`;
				case 'closed':
					return `closed:${l.reason}`;
				case 'no_door':
					return 'no_door';
				case 'tier':
					return `tier:${l.type}:${l.tier}:${l.after}/${l.quantity}`;
				case 'discount_uses':
					return `discount_uses:${l.code}:${l.after}/${l.maxUses}`;
				case 'not_active':
					return `not_active:${l.type}`;
			}
		})
		.sort()
		.join('|');
}

/**
 * Lo que manda el formulario del panel después de confirmar en el diálogo (`override`).
 * @param {FormData} form
 */
export function readOverride(form) {
	return String(form.get('override') ?? '').slice(0, 500);
}

/**
 * @typedef {{ limits: (ExceededLimit & { message: string })[], key: string }} NeedsConfirmation
 */

/**
 * ¿Se puede seguir? Sin límites pasados, sí (sin override). Con límites, solo si `confirmed` es
 * la clave de exactamente esos límites; si no, hace falta confirmar.
 *
 * @param {(ExceededLimit | null)[]} found
 * @param {string} confirmed lo que mandó el formulario (`readOverride`)
 * @returns {{ ok: true, override: boolean, limits: ExceededLimit[] }
 *   | { ok: false, needsConfirmation: NeedsConfirmation }}
 */
export function checkOverride(found, confirmed) {
	const limits = /** @type {ExceededLimit[]} */ (found.filter(Boolean));
	if (!limits.length) return { ok: true, override: false, limits };
	const key = overrideKey(limits);
	if (confirmed && confirmed === key) return { ok: true, override: true, limits };
	return {
		ok: false,
		needsConfirmation: { limits: limits.map((l) => ({ ...l, message: limitMessage(l) })), key }
	};
}

/**
 * Anota en el registro de actividad que se pasaron límites (una fila aparte de la de la acción,
 * con acción `tickets.override`, para encontrarlas todas juntas).
 *
 * @param {D1Database | null | undefined} db
 * @param {Parameters<typeof logAdminAction>[1]} locals
 * @param {{ event: string, what: string, orderId?: string | null, limits: ExceededLimit[] }} input
 *   `what`: qué se hizo ("venta en la puerta", "confirmación de transferencia", "carga a mano")
 */
export async function logOverride(db, locals, { event, what, orderId = null, limits }) {
	if (!limits.length) return false;
	return logAdminAction(db, locals, {
		action: 'tickets.override',
		targetType: orderId ? 'order' : 'event',
		targetId: orderId ?? event,
		summary: `Pasó límites de entradas (${what}): ${limits.map(limitSummary).join('; ')}`,
		detail: { event, what, overrides: limits }
	});
}

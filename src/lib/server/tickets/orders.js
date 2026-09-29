/**
 * Órdenes y entradas en D1 (tablas de migrations/0002_tickets.sql y 0003_tickets_v2.sql).
 *
 * Reglas importantes:
 * - Cupo: cuentan las órdenes aprobadas y las que todavía tienen la reserva vigente
 *   (`pending`/`rejected`/`awaiting_transfer` con `expires_at` en el futuro: con un pago
 *   rechazado, la persona puede reintentar en el mismo checkout de Mercado Pago mientras dure
 *   la reserva; una transferencia tiene una reserva más larga).
 * - Códigos de descuento: se vuelven a validar dentro de la misma sentencia que reserva el cupo
 *   (ver discounts.js), así que tampoco pueden pasarse de `max_uses`.
 * - Datos por entrada (nombre y pronombres): viajan en `orders.holders` (JSON) hasta que se
 *   emiten las entradas; ahí se copian a `tickets` y se borran de la orden. El DNI es de quien
 *   compra (`orders.buyer_dni`), uno por compra.
 * - La reserva es un único `INSERT ... SELECT ... WHERE <cupo alcanza>`: D1 ejecuta cada
 *   sentencia de forma atómica y serializada, así que dos compras simultáneas no pueden
 *   pasarse del cupo.
 * - Los cambios de estado por pagos son idempotentes y toleran notificaciones repetidas o
 *   desordenadas (ver `nextStatus`).
 */

import { computePrice } from '$lib/utils/tickets.js';
import { HOLDING, checkDiscountCode, discountGuardSql } from './discounts.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {'pending' | 'awaiting_transfer' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'expired'} OrderStatus */
/** @typedef {'mercadopago' | 'transferencia' | 'gratis'} OrderPaymentMethod */
/** @typedef {import('./config.js').Holder} Holder */
/**
 * @typedef {{
 *   id: string, event_slug: string, ticket_type: string, quantity: number, unit_price: number,
 *   fondo_option: import('$lib/utils/tickets.js').FondoOption, fondo_amount: number,
 *   fondo_contribution: number, subtotal: number, discount_code: string | null, discount_amount: number,
 *   surcharge_amount: number, total: number,
 *   payment_method: OrderPaymentMethod, buyer_name: string, buyer_email: string,
 *   buyer_dni: string | null, holders: string | null, status: OrderStatus,
 *   mp_preference_id: string | null, mp_payment_id: string | null, confirmed_by: string | null,
 *   email_sent_at: number | null, created_at: number, updated_at: number, expires_at: number
 * }} Order
 */
/**
 * @typedef {{
 *   id: string, order_id: string, event_slug: string, ticket_type: string, holder_name: string,
 *   holder_pronouns: string | null,
 *   token: string, checked_in_at: number | null, checked_in_by: string | null
 * }} Ticket
 */

/** Cuánto dura la reserva de cupo mientras la persona paga con Mercado Pago. */
export const HOLD_MS = 20 * 60 * 1000;

/** Reserva por defecto mientras se espera una transferencia (TICKETS_TRANSFER_HOLD_HOURS). */
export const TRANSFER_HOLD_MS = 48 * 60 * 60 * 1000;

const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** @param {unknown} id */
export function isValidOrderId(id) {
	return typeof id === 'string' && ORDER_ID_RE.test(id);
}

/** @param {unknown} token */
export function isValidToken(token) {
	return typeof token === 'string' && TOKEN_RE.test(token);
}

/** Token aleatorio de 256 bits en base64url (43 caracteres). */
export function newToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * Reserva cupo creando una orden, solo si alcanza el cupo del tipo de entrada y (si hay código)
 * el código sigue valiendo y le quedan usos. Todo en UNA sentencia.
 *
 * - `mercadopago` y `gratis` → `pending` (la gratis se aprueba enseguida con `approveFreeOrder`).
 * - `transferencia` → `awaiting_transfer`, con la reserva más larga que se pase en `holdMs`.
 *
 * El total lo calcula acá el servidor (`computePrice`): precio del frontmatter − fondo (o + aporte
 * al fondo, según `option`), menos el descuento, más el recargo de Mercado Pago si se paga con MP.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   type: { id: string, price: number, fondo?: number, capacity: number },
 *   quantity: number,
 *   buyer: import('./config.js').Buyer,
 *   holders: Holder[],
 *   option?: import('$lib/utils/tickets.js').FondoOption,
 *   feeBasisPoints?: number,
 *   method?: OrderPaymentMethod,
 *   discount?: { code: string, kind: 'percent' | 'fixed', value: number } | null,
 *   now?: number,
 *   holdMs?: number
 * }} input
 * @returns {Promise<{ ok: true, order: Order }
 *   | { ok: false, reason: 'soldout', available: number }
 *   | { ok: false, reason: 'code', message: string }
 *   | { ok: false, reason: 'method' }>}
 */
export async function reserveOrder(db, input) {
	const { eventSlug, type, quantity, holders, buyer, now = Date.now() } = input;
	const discount = input.discount ?? null;
	const method = input.method ?? 'mercadopago';
	const prices = computePrice({
		price: type.price,
		fondo: type.fondo ?? 0,
		option: input.option,
		quantity,
		discount,
		method,
		feeBasisPoints: input.feeBasisPoints ?? 0
	});
	// El medio "gratis" es solo para total 0, y un total 0 solo puede ser "gratis".
	if ((method === 'gratis') !== (prices.total === 0)) return { ok: false, reason: 'method' };
	if (holders.length !== quantity) throw new Error('Falta la información de alguna entrada');
	const holdMs = input.holdMs ?? (method === 'transferencia' ? TRANSFER_HOLD_MS : HOLD_MS);
	const status = method === 'transferencia' ? 'awaiting_transfer' : 'pending';
	const id = crypto.randomUUID();
	const [, inserted] = await db.batch([
		expireStatement(db, eventSlug, now),
		db
			.prepare(
				`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal,
					discount_code, discount_amount, total, payment_method, buyer_name, buyer_email,
					holders, status, created_at, updated_at, expires_at, fondo_amount,
					surcharge_amount, buyer_dni, fondo_option, fondo_contribution)
				SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?12, ?15, ?16, ?17, ?7, ?8, ?18, ?19, ?9, ?9, ?10,
					?20, ?21, ?22, ?23, ?24
				WHERE (
					SELECT COALESCE(SUM(quantity), 0) FROM orders
					WHERE event_slug = ?2 AND ticket_type = ?3
						AND (status = 'approved' OR (status IN ${HOLDING} AND expires_at > ?9))
				) + ?4 <= ?11
				AND ${discountGuardSql({ code: '?12', kind: '?13', value: '?14', event: '?2', now: '?9' })}
				RETURNING *`
			)
			.bind(
				id,
				eventSlug,
				type.id,
				quantity,
				type.price,
				prices.subtotal,
				buyer.name,
				buyer.email,
				now,
				now + holdMs,
				type.capacity,
				discount?.code ?? null,
				discount?.kind ?? null,
				discount?.value ?? null,
				prices.discount,
				prices.total,
				method,
				JSON.stringify(holders),
				status,
				prices.fondo,
				prices.surcharge,
				buyer.dni,
				prices.option,
				prices.contribution
			)
	]);
	const order = /** @type {Order | undefined} */ (inserted.results[0]);
	if (order) return { ok: true, order };
	if (discount) {
		const check = await checkDiscountCode(db, { code: discount.code, eventSlug, now });
		if (!check.ok) return { ok: false, reason: 'code', message: check.message };
		if (check.discount.kind !== discount.kind || check.discount.value !== discount.value) {
			return { ok: false, reason: 'code', message: 'El código cambió: aplicalo de nuevo.' };
		}
	}
	const counts = await getCounts(db, eventSlug, now);
	const c = counts.get(type.id);
	return {
		ok: false,
		reason: 'soldout',
		available: Math.max(0, type.capacity - (c ? c.sold + c.held : 0))
	};
}

/**
 * Datos por entrada guardados en la orden (o, para órdenes viejas sin ese dato, el nombre de
 * quien compró en todas).
 *
 * @param {Pick<Order, 'holders' | 'buyer_name' | 'quantity'>} order
 * @returns {Holder[]}
 */
export function orderHolders(order) {
	/** @type {Holder[]} */
	let list = [];
	try {
		const parsed = order.holders ? JSON.parse(order.holders) : [];
		if (Array.isArray(parsed)) list = parsed;
	} catch {
		// JSON roto: usamos el nombre de quien compró.
	}
	return Array.from({ length: order.quantity }, (_, i) => ({
		name: String(list[i]?.name ?? order.buyer_name),
		pronouns: String(list[i]?.pronouns ?? '')
	}));
}

/**
 * Sentencias que emiten las entradas de una orden ya aprobada (en el mismo batch que la
 * aprobación). Cada INSERT agrega la entrada n solo si ya hay exactamente n: repetir el batch
 * (webhooks duplicados, doble click en "Confirmar pago") nunca duplica. Al final se borran los
 * datos por entrada de la orden (ya quedaron en `tickets`).
 *
 * @param {D1Database} db
 * @param {Order} order
 */
function issueTicketsStatements(db, order) {
	const holders = orderHolders(order);
	const inserts = holders.map((h, i) =>
		db
			.prepare(
				`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name,
					holder_pronouns, token)
				SELECT ?1, o.id, o.event_slug, o.ticket_type, ?4, ?5, ?2 FROM orders o
				WHERE o.id = ?3 AND o.status = 'approved'
					AND (SELECT COUNT(*) FROM tickets WHERE order_id = ?3) = ?6`
			)
			.bind(crypto.randomUUID(), newToken(), order.id, h.name, h.pronouns || null, i)
	);
	const clear = db
		.prepare(
			`UPDATE orders SET holders = NULL WHERE id = ?1 AND status = 'approved'
				AND (SELECT COUNT(*) FROM tickets WHERE order_id = ?1) >= quantity`
		)
		.bind(order.id);
	return [...inserts, clear];
}

/**
 * Marca como `expired` las reservas vencidas (solo cosmético: el conteo ya las ignora).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} now
 */
function expireStatement(db, eventSlug, now) {
	return db
		.prepare(
			`UPDATE orders SET status = 'expired', updated_at = ?2
			WHERE event_slug = ?1 AND status IN ${HOLDING} AND expires_at <= ?2`
		)
		.bind(eventSlug, now);
}

/**
 * Por tipo de entrada: vendidas, reservadas, lo cobrado (con descuentos y recargo de MP), lo
 * que cubrió el Fondo KinkyVibe, lo que se aportó al fondo (entradas solidarias) y el recargo de
 * MP (que se va en la comisión). Solo cuentan las órdenes aprobadas (salvo `held`).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} [now]
 * @returns {Promise<Map<string, { sold: number, held: number, revenue: number, fondo: number, contribution: number, surcharge: number }>>}
 */
export async function getCounts(db, eventSlug, now = Date.now()) {
	const { results } = await db
		.prepare(
			`SELECT ticket_type,
				SUM(CASE WHEN status = 'approved' THEN quantity ELSE 0 END) AS sold,
				SUM(CASE WHEN status IN ${HOLDING} AND expires_at > ?2 THEN quantity ELSE 0 END) AS held,
				SUM(CASE WHEN status = 'approved' THEN total ELSE 0 END) AS revenue,
				SUM(CASE WHEN status = 'approved' THEN fondo_amount ELSE 0 END) AS fondo,
				SUM(CASE WHEN status = 'approved' THEN fondo_contribution ELSE 0 END) AS contribution,
				SUM(CASE WHEN status = 'approved' THEN surcharge_amount ELSE 0 END) AS surcharge
			FROM orders WHERE event_slug = ?1 GROUP BY ticket_type`
		)
		.bind(eventSlug, now)
		.all();
	return new Map(
		results.map((r) => [
			String(r.ticket_type),
			{
				sold: Number(r.sold ?? 0),
				held: Number(r.held ?? 0),
				revenue: Number(r.revenue ?? 0),
				fondo: Number(r.fondo ?? 0),
				contribution: Number(r.contribution ?? 0),
				surcharge: Number(r.surcharge ?? 0)
			}
		])
	);
}

/**
 * @param {D1Database} db
 * @param {string} id
 * @returns {Promise<Order | null>}
 */
export async function getOrder(db, id) {
	if (!isValidOrderId(id)) return null;
	return /** @type {Order | null} */ (
		await db.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first()
	);
}

/**
 * @param {D1Database} db
 * @param {string} id
 * @param {string} preferenceId
 */
export async function setPreference(db, id, preferenceId) {
	await db
		.prepare('UPDATE orders SET mp_preference_id = ?2, updated_at = ?3 WHERE id = ?1')
		.bind(id, preferenceId, Date.now())
		.run();
}

/**
 * Libera la reserva de una orden que nunca llegó a Mercado Pago (p. ej. falló la preferencia).
 *
 * @param {D1Database} db
 * @param {string} id
 */
export async function cancelPendingOrder(db, id) {
	await db
		.prepare(
			"UPDATE orders SET status = 'cancelled', updated_at = ?2 WHERE id = ?1 AND status = 'pending' AND mp_payment_id IS NULL"
		)
		.bind(id, Date.now())
		.run();
}

/**
 * Estado de un pago de MP → estado de orden. `null` para estados que no cambian nada.
 * https://www.mercadopago.com.ar/developers/es/reference/payments/_payments_id/get
 *
 * @param {unknown} mpStatus
 * @returns {OrderStatus | null}
 */
export function mapPaymentStatus(mpStatus) {
	switch (mpStatus) {
		case 'approved':
			return 'approved';
		case 'rejected':
			return 'rejected';
		case 'cancelled':
			return 'cancelled';
		case 'refunded':
		case 'charged_back':
			return 'refunded';
		case 'pending':
		case 'in_process':
		case 'authorized':
		case 'in_mediation':
			return 'pending';
		default:
			return null;
	}
}

/**
 * Máquina de estados de una orden frente a un pago. Devuelve el nuevo estado o `null` si la
 * notificación no cambia nada (repetida, vieja o de otro intento de pago).
 *
 * - `approved` gana sobre todo menos `refunded`: si la plata entró, la entrada vale, aunque la
 *   reserva haya vencido o antes haya llegado un rechazo de otro intento.
 * - Una orden aprobada solo pasa a `refunded`, y solo por el MISMO pago que la aprobó.
 * - `refunded` es final.
 *
 * @param {OrderStatus} current
 * @param {string | null} currentPaymentId
 * @param {OrderStatus} incoming
 * @param {string} paymentId
 * @returns {OrderStatus | null}
 */
export function nextStatus(current, currentPaymentId, incoming, paymentId) {
	if (current === 'refunded') return null;
	if (current === 'approved') {
		return incoming === 'refunded' && paymentId === currentPaymentId ? 'refunded' : null;
	}
	switch (incoming) {
		case 'approved':
		case 'refunded':
			return incoming;
		case 'rejected':
			return current === 'pending' ? 'rejected' : null;
		case 'cancelled':
			return current === 'pending' || current === 'rejected' ? 'cancelled' : null;
		default:
			return null;
	}
}

/**
 * @typedef {{
 *   id: string | number,
 *   status: string,
 *   external_reference?: string | null,
 *   transaction_amount?: number,
 *   currency_id?: string
 * }} MPPayment
 */

/**
 * Aplica un pago (ya obtenido de la API de MP, nunca del body del webhook) a su orden.
 *
 * @param {D1Database} db
 * @param {MPPayment} payment
 * @param {{ now?: number }} [options]
 * @returns {Promise<{
 *   outcome: 'unknown-order' | 'mismatch' | 'unchanged' | 'updated',
 *   order: Order | null,
 *   newlyApproved: boolean,
 *   tickets: Ticket[]
 * }>}
 */
export async function applyPayment(db, payment, { now = Date.now() } = {}) {
	const paymentId = String(payment.id);
	const order = await getOrder(db, String(payment.external_reference ?? ''));
	if (!order) return { outcome: 'unknown-order', order: null, newlyApproved: false, tickets: [] };
	if (order.payment_method !== 'mercadopago') {
		console.error(
			`[tickets] pago ${paymentId} para la orden ${order.id}, que no es de Mercado Pago`
		);
		return { outcome: 'mismatch', order, newlyApproved: false, tickets: [] };
	}

	// El monto y la moneda tienen que coincidir con lo que calculamos nosotres al crear la orden.
	if (payment.currency_id !== 'ARS' || Number(payment.transaction_amount) !== order.total) {
		console.error(
			`[tickets] pago ${paymentId} no coincide con la orden ${order.id}: ` +
				`${payment.transaction_amount} ${payment.currency_id} ≠ ${order.total} ARS`
		);
		return { outcome: 'mismatch', order, newlyApproved: false, tickets: [] };
	}

	const incoming = mapPaymentStatus(payment.status);
	let current = order;
	// Reintento corto por si otra notificación del mismo pago cambia la orden en paralelo.
	for (let attempt = 0; attempt < 3; attempt++) {
		const next = incoming && nextStatus(current.status, current.mp_payment_id, incoming, paymentId);
		if (!next) return { outcome: 'unchanged', order: current, newlyApproved: false, tickets: [] };

		const update = db
			.prepare(
				`UPDATE orders SET status = ?3, mp_payment_id = ?4, updated_at = ?5
				WHERE id = ?1 AND status = ?2`
			)
			.bind(order.id, current.status, next, paymentId, now);

		if (next !== 'approved') {
			const res = await update.run();
			if (res.meta.changes === 1) {
				const updated = /** @type {Order} */ (await getOrder(db, order.id));
				return { outcome: 'updated', order: updated, newlyApproved: false, tickets: [] };
			}
		} else {
			// Aprobar y emitir las entradas en la misma transacción.
			const [res] = await db.batch([update, ...issueTicketsStatements(db, order)]);
			if (res.meta.changes === 1) {
				const updated = /** @type {Order} */ (await getOrder(db, order.id));
				if (current.status === 'expired' || current.status === 'cancelled') {
					console.warn(
						`[tickets] la orden ${order.id} se aprobó con la reserva vencida (${current.status}): ` +
							'revisar cupo del evento por posible sobreventa.'
					);
				}
				return {
					outcome: 'updated',
					order: updated,
					newlyApproved: true,
					tickets: await getOrderTickets(db, order.id)
				};
			}
		}
		const fresh = await getOrder(db, order.id);
		if (!fresh) break;
		current = fresh;
	}
	return { outcome: 'unchanged', order: current, newlyApproved: false, tickets: [] };
}

/**
 * @param {D1Database} db
 * @param {string} orderId
 * @returns {Promise<Ticket[]>}
 */
export async function getOrderTickets(db, orderId) {
	const { results } = await db
		.prepare('SELECT * FROM tickets WHERE order_id = ?1 ORDER BY rowid')
		.bind(orderId)
		.all();
	return /** @type {Ticket[]} */ (results);
}

/**
 * @param {D1Database} db
 * @param {string} orderId
 * @param {number} [now]
 */
export async function markEmailSent(db, orderId, now = Date.now()) {
	await db.prepare('UPDATE orders SET email_sent_at = ?2 WHERE id = ?1').bind(orderId, now).run();
}

/**
 * Entrada + estado de su orden, para la página de la entrada y el check-in.
 *
 * @param {D1Database} db
 * @param {string} token
 * Incluye nombre y DNI de quien compró: solo para el admin (la página pública no los usa).
 *
 * @returns {Promise<(Ticket & { order_status: OrderStatus, buyer_name: string, buyer_dni: string | null }) | null>}
 */
export async function getTicketByToken(db, token) {
	if (!isValidToken(token)) return null;
	return /** @type {(Ticket & { order_status: OrderStatus, buyer_name: string, buyer_dni: string | null }) | null} */ (
		await db
			.prepare(
				`SELECT t.*, o.status AS order_status, o.buyer_name, o.buyer_dni FROM tickets t
				JOIN orders o ON o.id = t.order_id WHERE t.token = ?1`
			)
			.bind(token)
			.first()
	);
}

/**
 * Marca el ingreso de una entrada. Una sola sentencia condicional: si dos personas escanean la
 * misma entrada a la vez, solo una gana.
 *
 * @param {D1Database} db
 * @param {{ token: string, eventSlug: string, by: string, now?: number }} input
 * @returns {Promise<{
 *   result: 'ok' | 'already' | 'wrong-event' | 'void' | 'invalid',
 *   ticket: (Ticket & { order_status?: OrderStatus }) | null
 * }>}
 */
export async function checkIn(db, { token, eventSlug, by, now = Date.now() }) {
	if (!isValidToken(token)) return { result: 'invalid', ticket: null };
	const updated = /** @type {Ticket | null} */ (
		await db
			.prepare(
				`UPDATE tickets SET checked_in_at = ?3, checked_in_by = ?4
				WHERE token = ?1 AND event_slug = ?2 AND checked_in_at IS NULL
					AND (SELECT status FROM orders WHERE id = tickets.order_id) = 'approved'
				RETURNING *`
			)
			.bind(token, eventSlug, now, by)
			.first()
	);
	if (updated) return { result: 'ok', ticket: updated };
	const ticket = await getTicketByToken(db, token);
	if (!ticket) return { result: 'invalid', ticket: null };
	if (ticket.event_slug !== eventSlug) return { result: 'wrong-event', ticket };
	if (ticket.order_status !== 'approved') return { result: 'void', ticket };
	return { result: 'already', ticket };
}

/**
 * Deshace un ingreso marcado por error.
 *
 * @param {D1Database} db
 * @param {{ ticketId: string, eventSlug: string }} input
 */
export async function undoCheckIn(db, { ticketId, eventSlug }) {
	const res = await db
		.prepare(
			'UPDATE tickets SET checked_in_at = NULL, checked_in_by = NULL WHERE id = ?1 AND event_slug = ?2'
		)
		.bind(ticketId, eventSlug)
		.run();
	return res.meta.changes === 1;
}

/**
 * Órdenes de un evento (más nuevas primero), con cuántas entradas ya ingresaron.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<(Order & { checked_in: number })[]>}
 */
export async function listOrders(db, eventSlug) {
	const { results } = await db
		.prepare(
			`SELECT o.*, (SELECT COUNT(*) FROM tickets t
				WHERE t.order_id = o.id AND t.checked_in_at IS NOT NULL) AS checked_in
			FROM orders o WHERE o.event_slug = ?1 ORDER BY o.created_at DESC`
		)
		.bind(eventSlug)
		.all();
	return /** @type {(Order & { checked_in: number })[]} */ (results);
}

/**
 * Entradas válidas de un evento, con filtro opcional por nombre (de la entrada o de quien
 * compró), email, DNI de quien compró o comienzo del token.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} [query]
 * @returns {Promise<(Ticket & { buyer_email: string, buyer_name: string, buyer_dni: string | null })[]>}
 */
export async function searchTickets(db, eventSlug, query = '') {
	const q = query.trim().toLowerCase().slice(0, 80);
	/** @param {string} v */
	const esc = (v) => v.replace(/[\\%_]/g, (c) => '\\' + c);
	const like = `%${esc(q)}%`;
	// DNI de quien compró: solo si la búsqueda son números (con o sin puntos), por comienzo.
	const dni = /^[0-9.\s]{3,}$/.test(q) ? `${q.replace(/[.\s]/g, '')}%` : null;
	const { results } = await db
		.prepare(
			`SELECT t.*, o.buyer_email, o.buyer_name, o.buyer_dni FROM tickets t
			JOIN orders o ON o.id = t.order_id
			WHERE t.event_slug = ?1 AND o.status = 'approved'
				AND (?2 = '' OR lower(t.holder_name) LIKE ?3 ESCAPE '\\'
					OR lower(o.buyer_name) LIKE ?3 ESCAPE '\\'
					OR lower(o.buyer_email) LIKE ?3 ESCAPE '\\' OR t.token LIKE ?4 ESCAPE '\\'
					OR (?5 IS NOT NULL AND o.buyer_dni LIKE ?5))
			ORDER BY t.holder_name COLLATE NOCASE LIMIT 50`
		)
		.bind(eventSlug, q, like, `${esc(query.trim())}%`, dni)
		.all();
	return /** @type {(Ticket & { buyer_email: string, buyer_name: string, buyer_dni: string | null })[]} */ (
		results
	);
}

/**
 * Entradas emitidas de un evento (para la lista de órdenes y el CSV del admin).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<Ticket[]>}
 */
export async function listEventTickets(db, eventSlug) {
	const { results } = await db
		.prepare('SELECT * FROM tickets WHERE event_slug = ?1 ORDER BY order_id, rowid')
		.bind(eventSlug)
		.all();
	return /** @type {Ticket[]} */ (results);
}

/**
 * Aprueba y emite las entradas de una orden con total 0 (código de 100%): no pasa por Mercado
 * Pago. Idempotente.
 *
 * @param {D1Database} db
 * @param {Order} order
 * @param {{ now?: number }} [options]
 * @returns {Promise<{ newlyApproved: boolean, order: Order | null, tickets: Ticket[] }>}
 */
export async function approveFreeOrder(db, order, { now = Date.now() } = {}) {
	const update = db
		.prepare(
			`UPDATE orders SET status = 'approved', updated_at = ?2
			WHERE id = ?1 AND payment_method = 'gratis' AND total = 0 AND status = 'pending'`
		)
		.bind(order.id, now);
	const [res] = await db.batch([update, ...issueTicketsStatements(db, order)]);
	return {
		newlyApproved: res.meta.changes === 1,
		order: await getOrder(db, order.id),
		tickets: await getOrderTickets(db, order.id)
	};
}

/**
 * Confirma a mano (admin) que llegó una transferencia: aprueba la orden y emite las entradas,
 * en una sola transacción e idempotente (dos clicks en "Confirmar pago" emiten una vez).
 *
 * Si la reserva ya venció, solo se confirma si todavía hay cupo (comprobado en la misma
 * sentencia), para no sobrevender. En ese caso no se vuelve a mirar `max_uses` del código:
 * quien confirma decide.
 *
 * @param {D1Database} db
 * @param {{ orderId: string, eventSlug: string, capacity: number, by: string, now?: number }} input
 * @returns {Promise<{
 *   result: 'confirmed' | 'already' | 'no-capacity' | 'not-transfer' | 'not-found' | 'cancelled',
 *   order: Order | null,
 *   tickets: Ticket[]
 * }>}
 */
export async function confirmTransfer(db, { orderId, eventSlug, capacity, by, now = Date.now() }) {
	const order = await getOrder(db, orderId);
	if (!order || order.event_slug !== eventSlug)
		return { result: 'not-found', order: null, tickets: [] };
	if (order.payment_method !== 'transferencia')
		return { result: 'not-transfer', order, tickets: [] };
	const update = db
		.prepare(
			`UPDATE orders SET status = 'approved', confirmed_by = ?3, updated_at = ?2
			WHERE id = ?1 AND payment_method = 'transferencia' AND (
				(status = 'awaiting_transfer' AND expires_at > ?2)
				OR (status IN ('awaiting_transfer', 'expired') AND (
					SELECT COALESCE(SUM(o2.quantity), 0) FROM orders o2
					WHERE o2.event_slug = orders.event_slug AND o2.ticket_type = orders.ticket_type
						AND o2.id != orders.id
						AND (o2.status = 'approved' OR (o2.status IN ${HOLDING} AND o2.expires_at > ?2))
				) + orders.quantity <= ?4)
			)`
		)
		.bind(order.id, now, by, capacity);
	const [res] = await db.batch([update, ...issueTicketsStatements(db, order)]);
	const fresh = await getOrder(db, order.id);
	if (res.meta.changes === 1) {
		return { result: 'confirmed', order: fresh, tickets: await getOrderTickets(db, order.id) };
	}
	if (fresh?.status === 'approved') return { result: 'already', order: fresh, tickets: [] };
	if (fresh?.status === 'cancelled') return { result: 'cancelled', order: fresh, tickets: [] };
	return { result: 'no-capacity', order: fresh, tickets: [] };
}

/**
 * Cancela (admin) una transferencia que no llegó: libera el cupo y el uso del código.
 *
 * @param {D1Database} db
 * @param {{ orderId: string, eventSlug: string, by: string, now?: number }} input
 */
export async function cancelTransfer(db, { orderId, eventSlug, by, now = Date.now() }) {
	if (!isValidOrderId(orderId)) return false;
	const res = await db
		.prepare(
			`UPDATE orders SET status = 'cancelled', confirmed_by = ?3, updated_at = ?4
			WHERE id = ?1 AND event_slug = ?2 AND payment_method = 'transferencia'
				AND status IN ('awaiting_transfer', 'expired')`
		)
		.bind(orderId, eventSlug, by, now)
		.run();
	return res.meta.changes === 1;
}

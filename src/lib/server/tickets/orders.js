/**
 * Órdenes y entradas en D1 (tablas de migrations/0002_tickets.sql).
 *
 * Reglas importantes:
 * - Cupo: cuentan las órdenes aprobadas y las que todavía tienen la reserva vigente
 *   (`pending`/`rejected` con `expires_at` en el futuro: con un pago rechazado, la persona
 *   puede reintentar en el mismo checkout de Mercado Pago mientras dure la reserva).
 * - La reserva es un único `INSERT ... SELECT ... WHERE <cupo alcanza>`: D1 ejecuta cada
 *   sentencia de forma atómica y serializada, así que dos compras simultáneas no pueden
 *   pasarse del cupo.
 * - Los cambios de estado por pagos son idempotentes y toleran notificaciones repetidas o
 *   desordenadas (ver `nextStatus`).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'expired'} OrderStatus */
/**
 * @typedef {{
 *   id: string, event_slug: string, ticket_type: string, quantity: number, unit_price: number,
 *   total: number, buyer_name: string, buyer_email: string, status: OrderStatus,
 *   mp_preference_id: string | null, mp_payment_id: string | null, email_sent_at: number | null,
 *   created_at: number, updated_at: number, expires_at: number
 * }} Order
 */
/**
 * @typedef {{
 *   id: string, order_id: string, event_slug: string, ticket_type: string, holder_name: string,
 *   token: string, checked_in_at: number | null, checked_in_by: string | null
 * }} Ticket
 */

/** Cuánto dura la reserva de cupo mientras la persona paga. */
export const HOLD_MS = 20 * 60 * 1000;

const ORDER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Estados que ocupan cupo mientras `expires_at` no pasó. */
const HOLDING = "('pending', 'rejected')";

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
 * Reserva cupo creando una orden `pending`, solo si alcanza el cupo del tipo de entrada.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   type: { id: string, price: number, capacity: number },
 *   quantity: number,
 *   name: string,
 *   email: string,
 *   now?: number,
 *   holdMs?: number
 * }} input
 * @returns {Promise<{ ok: true, order: Order } | { ok: false, reason: 'soldout', available: number }>}
 */
export async function reserveOrder(db, input) {
	const { eventSlug, type, quantity, name, email, now = Date.now(), holdMs = HOLD_MS } = input;
	const id = crypto.randomUUID();
	const [, inserted] = await db.batch([
		expireStatement(db, eventSlug, now),
		db
			.prepare(
				`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, total,
					buyer_name, buyer_email, status, created_at, updated_at, expires_at)
				SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9, ?9, ?10
				WHERE (
					SELECT COALESCE(SUM(quantity), 0) FROM orders
					WHERE event_slug = ?2 AND ticket_type = ?3
						AND (status = 'approved' OR (status IN ${HOLDING} AND expires_at > ?9))
				) + ?4 <= ?11
				RETURNING *`
			)
			.bind(
				id,
				eventSlug,
				type.id,
				quantity,
				type.price,
				type.price * quantity,
				name,
				email,
				now,
				now + holdMs,
				type.capacity
			)
	]);
	const order = /** @type {Order | undefined} */ (inserted.results[0]);
	if (order) return { ok: true, order };
	const counts = await getCounts(db, eventSlug, now);
	const c = counts.get(type.id);
	return {
		ok: false,
		reason: 'soldout',
		available: Math.max(0, type.capacity - (c ? c.sold + c.held : 0))
	};
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
 * Vendidas, reservadas y recaudación bruta por tipo de entrada.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} [now]
 * @returns {Promise<Map<string, { sold: number, held: number, revenue: number }>>}
 */
export async function getCounts(db, eventSlug, now = Date.now()) {
	const { results } = await db
		.prepare(
			`SELECT ticket_type,
				SUM(CASE WHEN status = 'approved' THEN quantity ELSE 0 END) AS sold,
				SUM(CASE WHEN status IN ${HOLDING} AND expires_at > ?2 THEN quantity ELSE 0 END) AS held,
				SUM(CASE WHEN status = 'approved' THEN total ELSE 0 END) AS revenue
			FROM orders WHERE event_slug = ?1 GROUP BY ticket_type`
		)
		.bind(eventSlug, now)
		.all();
	return new Map(
		results.map((r) => [
			String(r.ticket_type),
			{ sold: Number(r.sold ?? 0), held: Number(r.held ?? 0), revenue: Number(r.revenue ?? 0) }
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
			// Aprobar y emitir las entradas en la misma transacción. Cada INSERT solo agrega si
			// todavía faltan entradas para la orden, así que repetirlo nunca duplica.
			const inserts = Array.from({ length: order.quantity }, () =>
				db
					.prepare(
						`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name, token)
						SELECT ?1, o.id, o.event_slug, o.ticket_type, o.buyer_name, ?2 FROM orders o
						WHERE o.id = ?3 AND o.status = 'approved'
							AND (SELECT COUNT(*) FROM tickets WHERE order_id = ?3) < o.quantity`
					)
					.bind(crypto.randomUUID(), newToken(), order.id)
			);
			const [res] = await db.batch([update, ...inserts]);
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
 * @returns {Promise<(Ticket & { order_status: OrderStatus }) | null>}
 */
export async function getTicketByToken(db, token) {
	if (!isValidToken(token)) return null;
	return /** @type {(Ticket & { order_status: OrderStatus }) | null} */ (
		await db
			.prepare(
				`SELECT t.*, o.status AS order_status FROM tickets t
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
 * Entradas válidas de un evento, con filtro opcional por nombre, email o comienzo del token.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} [query]
 * @returns {Promise<(Ticket & { buyer_email: string })[]>}
 */
export async function searchTickets(db, eventSlug, query = '') {
	const q = query.trim().toLowerCase().slice(0, 80);
	const like = `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
	const { results } = await db
		.prepare(
			`SELECT t.*, o.buyer_email FROM tickets t JOIN orders o ON o.id = t.order_id
			WHERE t.event_slug = ?1 AND o.status = 'approved'
				AND (?2 = '' OR lower(t.holder_name) LIKE ?3 ESCAPE '\\'
					OR lower(o.buyer_email) LIKE ?3 ESCAPE '\\' OR t.token LIKE ?4 ESCAPE '\\')
			ORDER BY t.holder_name COLLATE NOCASE LIMIT 50`
		)
		.bind(eventSlug, q, like, `${query.trim().replace(/[\\%_]/g, (c) => '\\' + c)}%`)
		.all();
	return /** @type {(Ticket & { buyer_email: string })[]} */ (results);
}

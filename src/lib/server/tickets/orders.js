/**
 * Órdenes y entradas en D1 (tablas de migrations/0002_tickets.sql).
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

import { computePrice, remainingOf } from '$lib/utils/tickets.js';
import { tierKey } from '$lib/utils/ticketTiers.js';
import { toBase64url } from '$lib/utils/base64.js';
import { HOLDING, checkDiscountCode, discountGuardSql } from './discounts.js';
import { capacityLimit, tierLimit } from './overrides.js';
import { answersStatement } from './signupFields.js';
import { TICKET_CODE_LENGTH, normalizeTicketCode } from '$lib/utils/ticketCode.js';

// El código corto se normaliza también en el navegador (modo puerta sin conexión).
export { TICKET_CODE_LENGTH, normalizeTicketCode };

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {'pending' | 'awaiting_transfer' | 'approved' | 'rejected' | 'cancelled' | 'refunded' | 'expired'} OrderStatus */
/** @typedef {'mercadopago' | 'transferencia' | 'gratis' | 'efectivo' | 'otro'} OrderPaymentMethod */
/** @typedef {import('./config.js').Holder} Holder */
/**
 * @typedef {{
 *   id: string, event_slug: string, ticket_type: string, quantity: number, unit_price: number,
 *   fondo_option: import('$lib/utils/tickets.js').PriceOption, fondo_amount: number,
 *   fondo_contribution: number, subtotal: number, discount_code: string | null, discount_amount: number,
 *   surcharge_amount: number, total: number, fondo_percent: number | null,
 *   payment_method: OrderPaymentMethod, buyer_name: string, buyer_pronouns: string | null,
 *   buyer_email: string,
 *   buyer_dni: string | null, holders: string | null, status: OrderStatus,
 *   mp_preference_id: string | null, mp_payment_id: string | null, confirmed_by: string | null,
 *   email_sent_at: number | null, created_at: number, updated_at: number, expires_at: number,
 *   refunded_at?: number | null, refunded_by?: string | null,
 *   client_hash?: string | null, needs_review?: 'late_payment' | 'duplicate_payment' | null,
 *   review_detail?: string | null, channel?: 'online' | 'puerta' | 'manual',
 *   admin_note?: string | null, ticket_tier?: string | null
 * }} Order
 */
/**
 * @typedef {{
 *   id: string, order_id: string, event_slug: string, ticket_type: string, holder_name: string,
 *   holder_pronouns: string | null, code: string | null,
 *   token: string, checked_in_at: number | null, checked_in_by: string | null
 * }} Ticket
 */

/** Cuánto dura la reserva de cupo mientras la persona paga con Mercado Pago. */
export const HOLD_MS = 20 * 60 * 1000;

/** Reserva por defecto mientras se espera una transferencia (TICKETS_TRANSFER_HOLD_HOURS). */
export const TRANSFER_HOLD_MS = 48 * 60 * 60 * 1000;

/**
 * Reserva inicial de una transferencia: se extiende a la completa cuando quien compra la confirma
 * desde el link del mail (ver `extendTransferHold`).
 */
export const TRANSFER_INITIAL_HOLD_MS = 2 * 60 * 60 * 1000;

/**
 * Topes de reservas abiertas (pendientes de pago) por evento: por email de quien compra y por
 * cliente (`client_hash`). Lo aprobado no cuenta. Un formulario completo entra holgado.
 */
export const HOLD_LIMITS = {
	/** Entradas reservadas a la vez por email. */
	perEmailQuantity: 20,
	/** Reservas (órdenes) abiertas a la vez por email. */
	perEmailOrders: 2,
	/** Entradas reservadas a la vez por cliente. */
	perClientQuantity: 40
};

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

/**
 * Letras y números del código corto de una entrada: sin 0/O, 1/I/L (se confunden al dictarlos o
 * tipearlos en la puerta). 31 símbolos: 6 caracteres ≈ 887 millones de combinaciones.
 */
export const TICKET_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Código corto aleatorio (sin sesgo: se descartan los bytes que no entran parejo). */
export function newTicketCode() {
	const n = TICKET_CODE_ALPHABET.length;
	const limit = 256 - (256 % n);
	let code = '';
	while (code.length < TICKET_CODE_LENGTH) {
		for (const b of crypto.getRandomValues(new Uint8Array(16))) {
			if (b < limit && code.length < TICKET_CODE_LENGTH) code += TICKET_CODE_ALPHABET[b % n];
		}
	}
	return code;
}

/** Token aleatorio de 256 bits en base64url (43 caracteres). */
export function newToken() {
	return toBase64url(crypto.getRandomValues(new Uint8Array(32)));
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
 * En un tipo "a la gorra" el precio por entrada es `unitPrice` (el monto que eligió la persona,
 * ya validado por `validatePurchase`), la opción es `gorra` y no se aplica ningún código.
 *
 * Preventas: con `type.tier` (el tramo vigente que eligió el servidor, ver `withTier` en
 * config.js), `type.price` ya es el precio del tramo, la orden guarda `ticket_tier` y la MISMA
 * sentencia controla que el tramo no se pase de su cantidad (aprobadas + reservas vigentes de ese
 * tramo). Si el tramo se llenó en el medio (otra compra simultánea) o pasó su fecha, devuelve
 * `reason: 'tier'` sin crear nada: quien llama vuelve a elegir el tramo y le avisa a la persona
 * que cambió el precio (nunca se cobra un precio distinto del que vio).
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   type: { id: string, price: number, fondo?: number, capacity: number | null,
 *     gorra?: { min: number, suggested: number } | null,
 *     tier?: { id: string, quantity: number | null, until: number | null } | null },
 *   quantity: number,
 *   buyer: import('./config.js').Buyer | Omit<import('./config.js').Buyer, 'pronouns'>,
 *   holders: Holder[],
 *   option?: import('$lib/utils/tickets.js').PriceOption,
 *   unitPrice?: number,
 *   fondoPercent?: number | null,
 *   feeBasisPoints?: number,
 *   method?: OrderPaymentMethod,
 *   discount?: { code: string, kind: 'percent' | 'fixed', value: number } | null,
 *   now?: number,
 *   holdMs?: number,
 *   clientHash?: string | null,
 *   limits?: typeof HOLD_LIMITS,
 *   answers?: import('$lib/utils/signupFields.js').Answer[]
 * }} input
 * Con `type.capacity` `null` (sin cupo) no hay límite de entradas del tipo.
 * `answers`: respuestas a las preguntas de inscripción (ya validadas), en la misma tanda.
 *
 * @returns {Promise<{ ok: true, order: Order }
 *   | { ok: false, reason: 'soldout', available: number | null }
 *   | { ok: false, reason: 'limit', message: string }
 *   | { ok: false, reason: 'code', message: string }
 *   | { ok: false, reason: 'tier' }
 *   | { ok: false, reason: 'method' }>}
 */
export async function reserveOrder(db, input) {
	const { eventSlug, type, quantity, holders, buyer, now = Date.now() } = input;
	const gorra = Boolean(type.gorra);
	if (gorra !== (input.option === 'gorra')) {
		throw new Error('La opción "a la gorra" es solo para los tipos a la gorra');
	}
	const price = gorra ? Number(input.unitPrice) : type.price;
	if (!Number.isSafeInteger(price) || price < (gorra ? (type.gorra?.min ?? 0) : 1)) {
		throw new Error('Precio por entrada inválido');
	}
	// Los códigos de descuento no aplican a la gorra.
	const discount = gorra ? null : (input.discount ?? null);
	const method = input.method ?? 'mercadopago';
	const prices = computePrice({
		price,
		fondo: gorra ? 0 : (type.fondo ?? 0),
		option: input.option,
		quantity,
		discount,
		method,
		feeBasisPoints: input.feeBasisPoints ?? 0
	});
	// El medio "gratis" es solo para total 0, y un total 0 solo puede ser "gratis".
	if ((method === 'gratis') !== (prices.total === 0)) return { ok: false, reason: 'method' };
	if (holders.length !== quantity) throw new Error('Falta la información de alguna entrada');
	const holdMs = input.holdMs ?? (method === 'transferencia' ? TRANSFER_INITIAL_HOLD_MS : HOLD_MS);
	const limits = input.limits ?? HOLD_LIMITS;
	const clientHash = input.clientHash ?? null;
	const status = method === 'transferencia' ? 'awaiting_transfer' : 'pending';
	const tier = gorra ? null : (type.tier ?? null);
	// La fecha del tramo se mira con el mismo `now` de la reserva (el que eligió el tramo).
	if (tier && tier.until !== null && now >= tier.until) return { ok: false, reason: 'tier' };
	const id = crypto.randomUUID();
	// Respuestas a las preguntas de inscripción: en la misma tanda, solo si la orden entró.
	const answers = input.answers?.length ? [answersStatement(db, id, input.answers, now)] : [];
	const [, inserted] = await db.batch([
		expireStatement(db, eventSlug, now),
		db
			.prepare(
				`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal,
					discount_code, discount_amount, total, payment_method, buyer_name, buyer_email,
					holders, status, created_at, updated_at, expires_at, fondo_amount,
					surcharge_amount, buyer_dni, fondo_option, fondo_contribution, buyer_pronouns,
					fondo_percent, client_hash, ticket_tier)
				SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?12, ?15, ?16, ?17, ?7, ?8, ?18, ?19, ?9, ?9, ?10,
					?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?31
				WHERE ${openHoldsSql('buyer_email = ?8', 'SUM(quantity)')} + ?4 <= ?28
				AND ${openHoldsSql('buyer_email = ?8', 'COUNT(*)')} < ?29
				AND (?27 IS NULL OR ${openHoldsSql('client_hash = ?27', 'SUM(quantity)')} + ?4 <= ?30)
				AND (?11 IS NULL OR (
					SELECT COALESCE(SUM(quantity), 0) FROM orders
					WHERE event_slug = ?2 AND ticket_type = ?3
						AND (status = 'approved' OR (status IN ${HOLDING} AND expires_at > ?9))
				) + ?4 <= ?11)
				AND (?32 IS NULL OR (
					SELECT COALESCE(SUM(quantity), 0) FROM orders
					WHERE event_slug = ?2 AND ticket_type = ?3 AND ticket_tier = ?31
						AND (status = 'approved' OR (status IN ${HOLDING} AND expires_at > ?9))
				) + ?4 <= ?32)
				AND ${discountGuardSql({ code: '?12', kind: '?13', value: '?14', event: '?2', now: '?9' })}
				RETURNING *`
			)
			.bind(
				id,
				eventSlug,
				type.id,
				quantity,
				price,
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
				prices.contribution,
				'pronouns' in buyer && buyer.pronouns ? buyer.pronouns : null,
				gorra ? null : (input.fondoPercent ?? null),
				clientHash,
				limits.perEmailQuantity,
				limits.perEmailOrders,
				limits.perClientQuantity,
				tier?.id ?? null,
				tier?.quantity ?? null
			),
		...answers
	]);
	const order = /** @type {Order | undefined} */ (inserted.results[0]);
	if (order) return { ok: true, order };
	const limited = await holdLimitMessage(db, {
		eventSlug,
		email: buyer.email,
		clientHash,
		quantity,
		limits,
		now
	});
	if (limited) return { ok: false, reason: 'limit', message: limited };
	if (discount) {
		const check = await checkDiscountCode(db, { code: discount.code, eventSlug, now });
		if (!check.ok) return { ok: false, reason: 'code', message: check.message };
		if (check.discount.kind !== discount.kind || check.discount.value !== discount.value) {
			return { ok: false, reason: 'code', message: 'El código cambió: aplicalo de nuevo.' };
		}
	}
	const counts = await getCounts(db, eventSlug, now);
	const available = remainingOf(type, counts.get(type.id));
	if (tier && tier.quantity !== null && available !== 0) {
		// Hay cupo: lo que se llenó fue el tramo.
		const taken = await tierTaken(db, { eventSlug, typeId: type.id, tierId: tier.id, now });
		if (taken + quantity > tier.quantity) return { ok: false, reason: 'tier' };
	}
	// `null`: sin cupo (no se agotó; algo cambió en el medio, se puede reintentar).
	return { ok: false, reason: 'soldout', available };
}

/**
 * Entradas tomadas (aprobadas + reservas vigentes) de un tramo, sin contar la orden `exceptId`.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, typeId: string, tierId: string, exceptId?: string | null,
 *   now?: number }} input
 */
export function tierTaken(db, { eventSlug, typeId, tierId, exceptId = null, now = Date.now() }) {
	return takenPlaces(db, { eventSlug, typeId, tierId, exceptId, now });
}

/**
 * Lo tomado (aprobadas + reservas vigentes) por tipo y por tramo, para elegir el tramo vigente y
 * saber si un tipo encadenado ya se habilitó (ver $lib/utils/ticketTiers.js).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} [now]
 * @returns {Promise<import('$lib/utils/ticketTiers.js').TakenCounts>}
 */
export async function getTaken(db, eventSlug, now = Date.now()) {
	const { results } = await db
		.prepare(
			`SELECT ticket_type, ticket_tier, COALESCE(SUM(quantity), 0) AS n FROM orders
			WHERE event_slug = ?1
				AND (status = 'approved' OR (status IN ${HOLDING} AND expires_at > ?2))
			GROUP BY ticket_type, ticket_tier`
		)
		.bind(eventSlug, now)
		.all();
	/** @type {import('$lib/utils/ticketTiers.js').TakenCounts} */
	const taken = { types: new Map(), tiers: new Map() };
	for (const r of results) {
		const type = String(r.ticket_type);
		const n = Number(r.n ?? 0);
		taken.types.set(type, (taken.types.get(type) ?? 0) + n);
		if (r.ticket_tier !== null && r.ticket_tier !== undefined) {
			taken.tiers.set(tierKey(type, String(r.ticket_tier)), n);
		}
	}
	return taken;
}

/**
 * Subconsulta: cantidad (o número) de reservas abiertas del evento `?2` que cumplen `where`.
 * @param {string} where
 * @param {'SUM(quantity)' | 'COUNT(*)'} what
 */
function openHoldsSql(where, what) {
	return `(SELECT COALESCE(${what}, 0) FROM orders
		WHERE event_slug = ?2 AND ${where} AND status IN ${HOLDING} AND expires_at > ?9)`;
}

/**
 * Si una reserva no entró por los topes de `HOLD_LIMITS`, el mensaje para quien compra.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, email: string, clientHash: string | null, quantity: number,
 *   limits: typeof HOLD_LIMITS, now: number }} input
 * @returns {Promise<string | null>}
 */
async function holdLimitMessage(db, { eventSlug, email, clientHash, quantity, limits, now }) {
	const row = /** @type {{ q: number, n: number, c: number } | null} */ (
		await db
			.prepare(
				`SELECT
					COALESCE(SUM(CASE WHEN buyer_email = ?2 THEN quantity END), 0) AS q,
					COUNT(CASE WHEN buyer_email = ?2 THEN 1 END) AS n,
					COALESCE(SUM(CASE WHEN ?3 IS NOT NULL AND client_hash = ?3 THEN quantity END), 0) AS c
				FROM orders
				WHERE event_slug = ?1 AND status IN ${HOLDING} AND expires_at > ?4`
			)
			.bind(eventSlug, email, clientHash, now)
			.first()
	);
	if (!row) return null;
	const pending =
		'Ya tenés reservas sin pagar para este evento: terminá esas compras (o esperá a que se liberen) antes de reservar más.';
	if (Number(row.n) >= limits.perEmailOrders) return pending;
	if (Number(row.q) + quantity > limits.perEmailQuantity) return pending;
	if (clientHash && Number(row.c) + quantity > limits.perClientQuantity)
		return 'Hay demasiadas entradas reservadas sin pagar desde esta conexión. Probá de nuevo más tarde.';
	return null;
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
 * Exportada para la venta en la puerta (door.js), que emite en el mismo batch que crea la orden.
 *
 * @param {D1Database} db
 * @param {Pick<Order, 'id' | 'holders' | 'buyer_name' | 'quantity'>} order
 */
export function issueTicketsStatements(db, order) {
	const holders = orderHolders(order);
	// Código corto: el primero de tres candidatos al azar que no esté usado en el evento (una
	// colisión no puede hacer fallar la aprobación de un pago; con tres, que choquen todos es
	// prácticamente imposible, y en ese caso la entrada queda sin código y sigue valiendo el QR).
	const inserts = holders.map((h, i) =>
		db
			.prepare(
				`INSERT INTO tickets (id, order_id, event_slug, ticket_type, holder_name,
					holder_pronouns, token, code)
				SELECT ?1, o.id, o.event_slug, o.ticket_type, ?4, ?5, ?2, (
					SELECT c.column1 FROM (VALUES (?7), (?8), (?9)) c
					WHERE c.column1 NOT IN (
						SELECT code FROM tickets WHERE event_slug = o.event_slug AND code IS NOT NULL
					) LIMIT 1
				) FROM orders o
				WHERE o.id = ?3 AND o.status = 'approved'
					AND (SELECT COUNT(*) FROM tickets WHERE order_id = ?3) = ?6`
			)
			.bind(
				crypto.randomUUID(),
				newToken(),
				order.id,
				h.name,
				h.pronouns || null,
				i,
				newTicketCode(),
				newTicketCode(),
				newTicketCode()
			)
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
 * Casos para revisar a mano (quedan marcados en `needs_review` y se ven en el admin):
 * - un pago aprobado para una orden cuya reserva ya había vencido o se había cancelado se acepta
 *   (la plata entró), pero si con eso el tipo de entrada pasa su cupo queda como `late_payment`
 *   (`capacityOf` dice el cupo; si no se sabe, también se marca);
 * - otro pago aprobado para una orden ya aprobada queda como `duplicate_payment`.
 *
 * @param {D1Database} db
 * @param {MPPayment} payment
 * @param {{ now?: number, capacityOf?: (order: Order) => Promise<number | null> }} [options]
 * @returns {Promise<{
 *   outcome: 'unknown-order' | 'mismatch' | 'unchanged' | 'updated' | 'flagged',
 *   order: Order | null,
 *   newlyApproved: boolean,
 *   tickets: Ticket[]
 * }>}
 */
export async function applyPayment(db, payment, { now = Date.now(), capacityOf } = {}) {
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
	if (
		incoming === 'approved' &&
		order.status === 'approved' &&
		order.mp_payment_id &&
		order.mp_payment_id !== paymentId
	) {
		// Un segundo cobro para la misma orden: no se toca la orden, se marca para revisar.
		console.error(
			`[tickets] otro pago aprobado (${paymentId}) para la orden ${order.id}, ya pagada con ${order.mp_payment_id}: revisar posible cobro doble`
		);
		const flagged = await flagOrder(db, order.id, 'duplicate_payment', paymentId, now);
		return {
			outcome: flagged ? 'flagged' : 'unchanged',
			order: (await getOrder(db, order.id)) ?? order,
			newlyApproved: false,
			tickets: []
		};
	}
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
			// Un reembolso que llega por el webhook también registra cuándo (quién: NULL = MP).
			const res = await (
				next === 'refunded'
					? db
							.prepare(
								`UPDATE orders SET status = ?3, mp_payment_id = ?4, updated_at = ?5,
								refunded_at = COALESCE(refunded_at, ?5) WHERE id = ?1 AND status = ?2`
							)
							.bind(order.id, current.status, next, paymentId, now)
					: update
			).run();
			if (res.meta.changes === 1) {
				const updated = /** @type {Order} */ (await getOrder(db, order.id));
				return { outcome: 'updated', order: updated, newlyApproved: false, tickets: [] };
			}
		} else {
			// Aprobar y emitir las entradas en la misma transacción.
			const [res] = await db.batch([update, ...issueTicketsStatements(db, order)]);
			if (res.meta.changes === 1) {
				let updated = /** @type {Order} */ (await getOrder(db, order.id));
				const late =
					current.status === 'expired' ||
					current.status === 'cancelled' ||
					(current.status !== 'approved' && current.expires_at <= now);
				if (late && (await overCapacity(db, updated, capacityOf, now))) {
					console.error(
						`[tickets] la orden ${order.id} se pagó con la reserva vencida y ya no había cupo: queda para revisar`
					);
					await flagOrder(db, order.id, 'late_payment', paymentId, now);
					updated = /** @type {Order} */ (await getOrder(db, order.id));
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
 * ¿Con esta orden (ya aprobada) su tipo de entrada pasa el cupo? Sin forma de saber el cupo
 * (`capacityOf` da `null`), se toma como que sí (mejor revisar de más). Un tipo sin cupo (sin
 * límite) tiene que dar `Infinity`.
 *
 * @param {D1Database} db
 * @param {Order} order
 * @param {((order: Order) => Promise<number | null>) | undefined} capacityOf
 * @param {number} now
 */
async function overCapacity(db, order, capacityOf, now) {
	let capacity = null;
	try {
		capacity = capacityOf ? await capacityOf(order) : null;
	} catch (error) {
		console.error('[tickets] no se pudo leer el cupo del evento:', error);
	}
	if (capacity === null) return true;
	const c = (await getCounts(db, order.event_slug, now)).get(order.ticket_type);
	return (c ? c.sold + c.held : 0) > capacity;
}

/**
 * Marca una orden para revisar a mano (no pisa una marca que ya tenga).
 *
 * @param {D1Database} db
 * @param {string} orderId
 * @param {'late_payment' | 'duplicate_payment'} reason
 * @param {string} detail id del pago
 * @param {number} now
 * @returns {Promise<boolean>} si se marcó ahora
 */
export async function flagOrder(db, orderId, reason, detail, now = Date.now()) {
	const res = await db
		.prepare(
			`UPDATE orders SET needs_review = ?2, review_detail = ?3, updated_at = ?4
			WHERE id = ?1 AND needs_review IS NULL`
		)
		.bind(orderId, reason, detail, now)
		.run();
	return res.meta.changes === 1;
}

/**
 * Órdenes marcadas para revisar (todas o de un evento).
 *
 * @param {D1Database} db
 * @param {string} [eventSlug]
 * @returns {Promise<Order[]>}
 */
export async function ordersNeedingReview(db, eventSlug) {
	const { results } = await (
		eventSlug
			? db
					.prepare(
						'SELECT * FROM orders WHERE needs_review IS NOT NULL AND event_slug = ?1 ORDER BY updated_at DESC'
					)
					.bind(eventSlug)
			: db.prepare('SELECT * FROM orders WHERE needs_review IS NOT NULL ORDER BY updated_at DESC')
	).all();
	return /** @type {Order[]} */ (results);
}

/**
 * Une admin ya revisó la orden: se saca la marca.
 *
 * @param {D1Database} db
 * @param {string} orderId
 * @param {number} [now]
 */
export async function clearReview(db, orderId, now = Date.now()) {
	const res = await db
		.prepare(
			`UPDATE orders SET needs_review = NULL, review_detail = NULL, updated_at = ?2
			WHERE id = ?1 AND needs_review IS NOT NULL`
		)
		.bind(orderId, now)
		.run();
	return res.meta.changes === 1;
}

/**
 * Quien compró confirmó su reserva por transferencia desde el link del mail: la reserva pasa a
 * durar `fullHoldMs` desde que se creó. Solo si todavía está vigente y esperando la transferencia.
 *
 * @param {D1Database} db
 * @param {string} orderId
 * @param {number} fullHoldMs
 * @param {number} [now]
 * @returns {Promise<Order | null>} la orden extendida, o null si no se pudo
 */
export async function extendTransferHold(db, orderId, fullHoldMs, now = Date.now()) {
	const res = await db
		.prepare(
			`UPDATE orders SET expires_at = MAX(expires_at, created_at + ?2), updated_at = ?3
			WHERE id = ?1 AND status = 'awaiting_transfer' AND expires_at > ?3`
		)
		.bind(orderId, fullHoldMs, now)
		.run();
	return res.meta.changes === 1 ? getOrder(db, orderId) : null;
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
 * Texto para comparar sin distinguir mayúsculas ni tildes ("Ñandú José" → "nandu jose").
 *
 * @param {unknown} value
 */
export function foldText(value) {
	return String(value ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

/** @typedef {'code' | 'holder' | 'pronouns' | 'buyer' | 'email' | 'dni'} SearchField */

/** Nombre de cada campo para mostrar "coincide con …" en el buscador del control de ingreso. */
export const SEARCH_FIELD_LABELS = /** @type {const} */ ({
	code: 'código',
	holder: 'nombre de la entrada',
	pronouns: 'pronombres',
	buyer: 'quien compró',
	email: 'email',
	dni: 'DNI'
});

/**
 * @typedef {Ticket & { buyer_email: string, buyer_name: string, buyer_dni: string | null }} SearchableTicket
 * @typedef {SearchableTicket & { match: { field: SearchField, value: string } | null }} TicketSearchResult
 */

/**
 * Busca entradas válidas (de órdenes aprobadas) de un evento por código, nombre y pronombres de
 * la entrada, y nombre, email y DNI de quien compró. Sin distinguir mayúsculas ni tildes; el
 * DNI y el código, sin puntos ni espacios. Cada resultado dice con qué campo coincidió (el
 * primero en este orden: código, nombre, pronombres, quien compró, email, DNI). Primero las
 * coincidencias al comienzo del campo o de una palabra.
 *
 * Se filtra en el servidor (SQLite no ignora tildes): un evento tiene a lo sumo unos miles de
 * entradas, así que alcanza con traerlas y comparar acá. Solo lo usan admins.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} [query]
 * @param {{ limit?: number }} [options]
 * @returns {Promise<TicketSearchResult[]>}
 */
export async function searchTickets(db, eventSlug, query = '', { limit = 50 } = {}) {
	const q = foldText(query.slice(0, 80));
	if (!q) return [];
	const digits = q.replace(/[.\s]/g, '');
	const code = normalizeTicketCode(query);
	// Comienzo de un código (desde 3 caracteres), con las mismas equivalencias que el código entero.
	const codeish = q
		.replace(/[\s\-_.]/g, '')
		.toUpperCase()
		.replace(/^KV(?=.{3})/, '')
		.replaceAll('O', '0')
		.replaceAll('I', '1')
		.replaceAll('L', '1');
	const { results } = await db
		.prepare(
			`SELECT t.*, o.buyer_email, o.buyer_name, o.buyer_dni FROM tickets t
			JOIN orders o ON o.id = t.order_id
			WHERE t.event_slug = ?1 AND o.status = 'approved'`
		)
		.bind(eventSlug)
		.all();
	/** @type {{ r: TicketSearchResult, rank: number }[]} */
	const found = [];
	for (const row of /** @type {SearchableTicket[]} */ (results)) {
		/** @type {[SearchField, string, string][]} */
		const fields = [
			['holder', row.holder_name, foldText(row.holder_name)],
			['pronouns', row.holder_pronouns ?? '', foldText(row.holder_pronouns)],
			['buyer', row.buyer_name, foldText(row.buyer_name)],
			['email', row.buyer_email, foldText(row.buyer_email)]
		];
		/** @type {{ field: SearchField, value: string } | null} */
		let match = null;
		let rank = 9;
		const rowCode = row.code ?? '';
		if (
			rowCode &&
			((code && rowCode === code) ||
				(/^[0-9A-Z]{3,6}$/.test(codeish) && rowCode.startsWith(codeish)))
		) {
			match = { field: 'code', value: rowCode };
			rank = rowCode === code ? 0 : 1;
		} else if (query.trim().length >= 8 && row.token.startsWith(query.trim())) {
			// Comienzo del token (el link del QR), por si alguien lo copia a mano.
			match = { field: 'code', value: rowCode };
			rank = 1;
		} else {
			for (const [field, value, folded] of fields) {
				const at = folded.indexOf(q);
				if (at === -1) continue;
				const wordStart = at === 0 || /[\s@._-]/.test(folded[at - 1]);
				match = { field, value };
				rank = at === 0 ? 2 : wordStart ? 3 : 4;
				break;
			}
			if (!match && digits.length >= 3 && /^\d+$/.test(digits) && row.buyer_dni?.includes(digits)) {
				match = { field: 'dni', value: row.buyer_dni };
				rank = row.buyer_dni.startsWith(digits) ? 2 : 4;
			}
		}
		if (match) found.push({ r: { ...row, match }, rank });
	}
	found.sort(
		(a, b) =>
			a.rank - b.rank ||
			a.r.holder_name.localeCompare(b.r.holder_name, 'es', { sensitivity: 'base' })
	);
	return found.slice(0, limit).map((f) => f.r);
}

/**
 * Token de la entrada de un evento con ese código corto (o `null`).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} code ya normalizado con `normalizeTicketCode`
 */
export async function tokenByCode(db, eventSlug, code) {
	const row = await db
		.prepare('SELECT token FROM tickets WHERE event_slug = ?1 AND code = ?2')
		.bind(eventSlug, code)
		.first();
	return row ? String(row.token) : null;
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
 * Con `override: true` (solo desde el panel, después de que une admin confirmó en el diálogo que
 * se pasa del cupo; ver overrides.js y `transferLimits`) se confirma igual aunque no haya cupo.
 *
 * @param {D1Database} db
 * `capacity` `null`: el tipo no tiene cupo (se confirma siempre).
 *
 * Con preventas: si la orden es de un tramo con cantidad (`tierQuantity`) y la reserva venció,
 * tampoco se confirma si el tramo ya se llenó (se puede pasar con `override`, igual que el cupo).
 *
 * @param {{ orderId: string, eventSlug: string, capacity: number | null, by: string, now?: number,
 *   override?: boolean, tierQuantity?: number | null }} input
 * @returns {Promise<{
 *   result: 'confirmed' | 'already' | 'no-capacity' | 'not-transfer' | 'not-found' | 'cancelled',
 *   order: Order | null,
 *   tickets: Ticket[]
 * }>}
 */
export async function confirmTransfer(
	db,
	{ orderId, eventSlug, capacity, by, now = Date.now(), override = false, tierQuantity = null }
) {
	const order = await getOrder(db, orderId);
	if (!order || order.event_slug !== eventSlug)
		return { result: 'not-found', order: null, tickets: [] };
	if (order.payment_method !== 'transferencia')
		return { result: 'not-transfer', order, tickets: [] };
	const update = db
		.prepare(
			`UPDATE orders SET status = 'approved', confirmed_by = ?3, updated_at = ?2
			WHERE id = ?1 AND payment_method = 'transferencia' AND (
				(?5 = 1 AND status IN ('awaiting_transfer', 'expired'))
				OR (status = 'awaiting_transfer' AND expires_at > ?2)
				OR (status IN ('awaiting_transfer', 'expired') AND (?4 IS NULL OR (
					SELECT COALESCE(SUM(o2.quantity), 0) FROM orders o2
					WHERE o2.event_slug = orders.event_slug AND o2.ticket_type = orders.ticket_type
						AND o2.id != orders.id
						AND (o2.status = 'approved' OR (o2.status IN ${HOLDING} AND o2.expires_at > ?2))
				) + orders.quantity <= ?4) AND (?6 IS NULL OR orders.ticket_tier IS NULL OR (
					SELECT COALESCE(SUM(o3.quantity), 0) FROM orders o3
					WHERE o3.event_slug = orders.event_slug AND o3.ticket_type = orders.ticket_type
						AND o3.ticket_tier = orders.ticket_tier AND o3.id != orders.id
						AND (o3.status = 'approved' OR (o3.status IN ${HOLDING} AND o3.expires_at > ?2))
				) + orders.quantity <= ?6))
			)`
		)
		.bind(order.id, now, by, capacity, override ? 1 : 0, tierQuantity);
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
 * Cuántas entradas del tipo cuentan para el cupo (aprobadas y reservas vigentes), sin contar
 * la orden `exceptId` (la que se está por confirmar). Con `tierId`, solo las de ese tramo.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, typeId: string, tierId?: string | null, exceptId?: string | null,
 *   now?: number }} input
 */
export async function takenPlaces(
	db,
	{ eventSlug, typeId, tierId = null, exceptId = null, now = Date.now() }
) {
	const row = await db
		.prepare(
			`SELECT COALESCE(SUM(quantity), 0) AS n FROM orders
			WHERE event_slug = ?1 AND ticket_type = ?2 AND (?4 IS NULL OR id != ?4)
				AND (?5 IS NULL OR ticket_tier = ?5)
				AND (status = 'approved' OR (status IN ${HOLDING} AND expires_at > ?3))`
		)
		.bind(eventSlug, typeId, now, exceptId, tierId)
		.first();
	return Number(row?.n ?? 0);
}

/**
 * Qué límites se pasarían al confirmar esta transferencia. Una reserva vigente ya tiene su
 * lugar (nada que pasar); una vencida (llegó tarde) solo entra si hay cupo: si no, se pasa del
 * cupo del tipo. Las canceladas, aprobadas o que no son transferencias no se confirman (las
 * rechaza `confirmTransfer`), así que acá dan `[]`.
 *
 * Con preventas, además, el tramo de la orden: si se llenó mientras la reserva estaba vencida, se
 * pasaría de su cantidad (el precio ya quedó fijo en la orden).
 *
 * @param {D1Database} db
 * @param {{ order: Order, type: { id: string, name: string, capacity: number | null,
 *   tiers?: import('$lib/utils/ticketTiers.js').Tier[] | null }, now?: number }} input
 * @returns {Promise<import('./overrides.js').ExceededLimit[]>}
 */
export async function transferLimits(db, { order, type, now = Date.now() }) {
	if (order.payment_method !== 'transferencia') return [];
	if (order.status !== 'awaiting_transfer' && order.status !== 'expired') return [];
	if (order.status === 'awaiting_transfer' && order.expires_at > now) return [];
	return placeLimits(db, { order, type, now });
}

/**
 * Qué límites se pasarían al deshacer el rechazo de una transferencia (volverla a "esperando
 * comprobante"): mientras estuvo cancelada no ocupaba lugar, así que vuelve a entrar solo si hay
 * cupo en su tipo y en su tramo. Mismos límites que `transferLimits` para una vencida. Una orden
 * que no es una transferencia cancelada da `[]` (la rechaza `reopenTransfer`).
 *
 * @param {D1Database} db
 * @param {Parameters<typeof transferLimits>[1]} input
 * @returns {Promise<import('./overrides.js').ExceededLimit[]>}
 */
export async function reopenLimits(db, { order, type, now = Date.now() }) {
	if (order.payment_method !== 'transferencia' || order.status !== 'cancelled') return [];
	return placeLimits(db, { order, type, now });
}

/**
 * Cupo del tipo y del tramo para una orden que hoy no ocupa lugar.
 *
 * @param {D1Database} db
 * @param {Parameters<typeof transferLimits>[1]} input
 */
async function placeLimits(db, { order, type, now = Date.now() }) {
	const taken = await takenPlaces(db, {
		eventSlug: order.event_slug,
		typeId: order.ticket_type,
		exceptId: order.id,
		now
	});
	const limits = [capacityLimit(type, taken, order.quantity)];
	const tier = orderTier(order, type);
	if (tier && tier.quantity !== null) {
		const inTier = await tierTaken(db, {
			eventSlug: order.event_slug,
			typeId: order.ticket_type,
			tierId: tier.id,
			exceptId: order.id,
			now
		});
		limits.push(tierLimit(type, tier, inTier, order.quantity));
	}
	return /** @type {import('./overrides.js').ExceededLimit[]} */ (limits.filter(Boolean));
}

/**
 * El tramo (del frontmatter de hoy) con el que se compró una orden, o `null`.
 *
 * @param {Pick<Order, 'ticket_tier'>} order
 * @param {{ tiers?: import('$lib/utils/ticketTiers.js').Tier[] | null }} type
 */
export function orderTier(order, type) {
	if (!order.ticket_tier) return null;
	return type.tiers?.find((t) => t.id === order.ticket_tier) ?? null;
}

/**
 * Marca una orden aprobada como reembolsada (admin): la de Mercado Pago después de que MP
 * aceptó el reembolso, o una transferencia / sin cargo devuelta a mano. Una sola sentencia
 * condicional: dos clicks (o el webhook de MP llegando a la vez) la cambian una sola vez.
 * Libera el cupo y el uso del código (solo cuentan aprobadas y reservas vigentes), sale de los
 * totales del fondo y anula sus entradas en el control de ingreso.
 *
 * @param {D1Database} db
 * @param {{ orderId: string, eventSlug: string, by: string, now?: number }} input
 * @returns {Promise<{ result: 'refunded' | 'already' | 'not-approved' | 'not-found', order: Order | null }>}
 */
export async function refundOrder(db, { orderId, eventSlug, by, now = Date.now() }) {
	const order = await getOrder(db, orderId);
	if (!order || order.event_slug !== eventSlug) return { result: 'not-found', order: null };
	const res = await db
		.prepare(
			`UPDATE orders SET status = 'refunded', refunded_at = ?2, refunded_by = ?3, updated_at = ?2
			WHERE id = ?1 AND status = 'approved'`
		)
		.bind(orderId, now, by)
		.run();
	const fresh = await getOrder(db, orderId);
	if (res.meta.changes === 1) return { result: 'refunded', order: fresh };
	return { result: fresh?.status === 'refunded' ? 'already' : 'not-approved', order: fresh };
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

/**
 * Deshace el rechazo (admin) de una transferencia cancelada: vuelve a "esperando comprobante"
 * con una reserva nueva de `holdMs` desde ahora (la vieja ya no sirve: mientras estuvo cancelada
 * el lugar quedó libre). Una sola sentencia condicional, como `confirmTransfer`: solo vuelve si
 * todavía hay cupo en el tipo (`capacity`) y en el tramo de la orden (`tierQuantity`), salvo
 * `override: true` (le admin confirmó en el diálogo que se pasa; ver `reopenLimits`).
 *
 * @param {D1Database} db
 * @param {{ orderId: string, eventSlug: string, capacity: number | null, by: string,
 *   holdMs: number, now?: number, override?: boolean, tierQuantity?: number | null }} input
 * @returns {Promise<{
 *   result: 'reopened' | 'already' | 'no-capacity' | 'not-transfer' | 'not-found' | 'not-cancelled',
 *   order: Order | null
 * }>}
 */
export async function reopenTransfer(
	db,
	{
		orderId,
		eventSlug,
		capacity,
		by,
		holdMs,
		now = Date.now(),
		override = false,
		tierQuantity = null
	}
) {
	const order = isValidOrderId(orderId) ? await getOrder(db, orderId) : null;
	if (!order || order.event_slug !== eventSlug) return { result: 'not-found', order: null };
	if (order.payment_method !== 'transferencia') return { result: 'not-transfer', order };
	const res = await db
		.prepare(
			`UPDATE orders SET status = 'awaiting_transfer', expires_at = ?3, confirmed_by = NULL,
				updated_at = ?2
			WHERE id = ?1 AND payment_method = 'transferencia' AND status = 'cancelled' AND (
				?5 = 1 OR ((?4 IS NULL OR (
					SELECT COALESCE(SUM(o2.quantity), 0) FROM orders o2
					WHERE o2.event_slug = orders.event_slug AND o2.ticket_type = orders.ticket_type
						AND o2.id != orders.id
						AND (o2.status = 'approved' OR (o2.status IN ${HOLDING} AND o2.expires_at > ?2))
				) + orders.quantity <= ?4) AND (?6 IS NULL OR orders.ticket_tier IS NULL OR (
					SELECT COALESCE(SUM(o3.quantity), 0) FROM orders o3
					WHERE o3.event_slug = orders.event_slug AND o3.ticket_type = orders.ticket_type
						AND o3.ticket_tier = orders.ticket_tier AND o3.id != orders.id
						AND (o3.status = 'approved' OR (o3.status IN ${HOLDING} AND o3.expires_at > ?2))
				) + orders.quantity <= ?6))
			)`
		)
		.bind(order.id, now, now + holdMs, capacity, override ? 1 : 0, tierQuantity)
		.run();
	const fresh = await getOrder(db, order.id);
	if (res.meta.changes === 1) return { result: 'reopened', order: fresh };
	if (fresh?.status === 'awaiting_transfer' && fresh.expires_at > now) {
		return { result: 'already', order: fresh };
	}
	if (fresh?.status !== 'cancelled') return { result: 'not-cancelled', order: fresh };
	return { result: 'no-capacity', order: fresh };
}

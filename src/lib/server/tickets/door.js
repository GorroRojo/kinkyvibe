/**
 * Modo puerta del panel (/admin/eventos/<slug>/ingreso): lo que la pantalla necesita del
 * servidor además del check-in de siempre (`checkIn`/`undoCheckIn` de orders.js).
 *
 * - `doorCounts`: "18 de 31 adentro" y el detalle por tipo.
 * - `scanView`: lo que se muestra al escanear (persona, compra, DNI parcial, primera vez).
 * - `purchaseDetails`: la hoja con la compra completa (al tocar el resultado).
 * - `revealDni`: el DNI completo, que queda en el registro de actividad.
 * - `offlineList` / `applyQueuedCheckIns`: modo sin conexión (lista para validar en el celu y
 *   sincronización de los ingresos marcados sin conexión, idempotente y con conflictos).
 * - `sellAtDoor`: "Vender en puerta" (orden aprobada al toque, respeta el cupo, entra ya), salvo
 *   en eventos con `puerta: false` (ver `doorSalesOpen`). Une admin puede pasar esos límites
 *   con confirmación (`doorSaleLimits` + overrides.js).
 * - `insertApprovedOrder`: la orden aprobada del panel (la usan la puerta y la carga a mano).
 * - `parseDoorSale` / `applyQueuedSales`: las ventas hechas sin conexión (decisión 0035): se
 *   registran en orden con `sellAtDoor`, de forma idempotente (`client_sale_id`), y si pasan un
 *   límite se guardan igual y quedan en «Para revisar» (`offline_review`).
 *
 * Privacidad: el DNI completo nunca va en la lista sin conexión ni en el escaneo (solo los
 * últimos 3 dígitos); se pide aparte y se registra quién lo vio.
 */
import {
	FREE_DOOR_MESSAGE,
	ORDER_MAX_MESSAGE,
	computePrice,
	exceedsOrderMax,
	isFondoOption,
	normalizeDni,
	parseAmount,
	remainingOf
} from '$lib/utils/tickets.js';
import { doorPrice } from '$lib/utils/ticketTiers.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { HOLDING } from './discounts.js';
import {
	capacityLimit,
	closedLimit,
	limitMessage,
	limitSummary,
	logOverride,
	maxPerPurchaseLimit,
	noDoorLimit
} from './overrides.js';
import { getCounts, isValidToken, issueTicketsStatements } from './orders.js';
import { isFirstTime } from './series.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./orders.js').Order} Order */
/** @typedef {import('./orders.js').Ticket} Ticket */
/** @typedef {import('./series.js').PriorAttendance} PriorAttendance */

/** Últimos 3 dígitos de un DNI ("30123456" → "456"), o '' si no hay. */
/** @param {string | null | undefined} dni */
export function dniTail(dni) {
	const digits = String(dni ?? '').replace(/\D/g, '');
	return digits ? digits.slice(-3) : '';
}

/** Referencia corta de una orden, como en los mails ("KV-1A2B3C4D"). */
/** @param {string} id */
export function orderRef(id) {
	return `KV-${String(id).slice(0, 8).toUpperCase()}`;
}

/**
 * Entradas válidas (de órdenes aprobadas) e ingresadas, en total y por tipo.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<{ total: number, inside: number, byType: Record<string, { total: number, inside: number }> }>}
 */
export async function doorCounts(db, slug) {
	const { results } = await db
		.prepare(
			`SELECT t.ticket_type, COUNT(*) AS total, COUNT(t.checked_in_at) AS inside FROM tickets t
			JOIN orders o ON o.id = t.order_id WHERE t.event_slug = ?1 AND o.status = 'approved'
			GROUP BY t.ticket_type`
		)
		.bind(slug)
		.all();
	/** @type {Record<string, { total: number, inside: number }>} */
	const byType = {};
	let total = 0;
	let inside = 0;
	for (const r of results) {
		const t = Number(r.total ?? 0);
		const i = Number(r.inside ?? 0);
		byType[String(r.ticket_type)] = { total: t, inside: i };
		total += t;
		inside += i;
	}
	return { total, inside, byType };
}

/**
 * @typedef {Ticket & {
 *   order_status: import('./orders.js').OrderStatus, buyer_name: string,
 *   buyer_email: string, buyer_dni: string | null, buyer_pronouns: string | null
 * }} TicketWithBuyer
 */

/**
 * @param {D1Database} db
 * @param {{ token?: string, id?: string }} by
 * @returns {Promise<TicketWithBuyer | null>}
 */
export async function ticketWithBuyer(db, { token, id }) {
	if (token !== undefined && !isValidToken(token)) return null;
	if (token === undefined && !id) return null;
	return /** @type {TicketWithBuyer | null} */ (
		await db
			.prepare(
				`SELECT t.*, o.status AS order_status, o.buyer_name, o.buyer_email, o.buyer_dni,
					o.buyer_pronouns
				FROM tickets t JOIN orders o ON o.id = t.order_id
				WHERE ${token !== undefined ? 't.token = ?1' : 't.id = ?1'}`
			)
			.bind(token ?? id)
			.first()
	);
}

/**
 * Lo que muestra la pantalla para una entrada (sin el DNI completo).
 *
 * @param {TicketWithBuyer} t
 * @param {{ typeNames: Record<string, string>, prior: PriorAttendance | null }} ctx
 */
export function ticketCard(t, { typeNames, prior }) {
	return {
		ticketId: t.id,
		orderId: t.order_id,
		orderRef: orderRef(t.order_id),
		holder: t.holder_name,
		pronouns: t.holder_pronouns ?? '',
		type: typeNames[t.ticket_type] ?? t.ticket_type,
		typeId: t.ticket_type,
		buyer: t.buyer_name,
		email: t.buyer_email,
		dniTail: dniTail(t.buyer_dni),
		code: t.code ?? '',
		at: t.checked_in_at,
		by: t.checked_in_by,
		firstTime: prior
			? isFirstTime(
					{ holder: t.holder_name, buyerName: t.buyer_name, buyerEmail: t.buyer_email },
					prior
				)
			: null
	};
}

/** @typedef {ReturnType<typeof ticketCard>} TicketCard */

/**
 * Detalle completo de la compra de una entrada del evento (hoja "Ver compra"). Sin el DNI
 * completo (se pide aparte con `revealDni`).
 *
 * @param {D1Database} db
 * @param {{ slug: string, ticketId: string, typeNames: Record<string, string> }} input
 */
export async function purchaseDetails(db, { slug, ticketId, typeNames }) {
	const t = await db
		.prepare('SELECT order_id FROM tickets WHERE id = ?1 AND event_slug = ?2')
		.bind(ticketId, slug)
		.first();
	if (!t) return null;
	const order = /** @type {Order | null} */ (
		await db.prepare('SELECT * FROM orders WHERE id = ?1').bind(t.order_id).first()
	);
	if (!order) return null;
	const { results } = await db
		.prepare('SELECT * FROM tickets WHERE order_id = ?1 ORDER BY rowid')
		.bind(order.id)
		.all();
	const tickets = /** @type {Ticket[]} */ (results);
	return {
		id: order.id,
		ref: orderRef(order.id),
		status: order.status,
		method: order.payment_method,
		channel: order.channel ?? 'online',
		type: typeNames[order.ticket_type] ?? order.ticket_type,
		quantity: order.quantity,
		unitPrice: order.unit_price,
		fondoOption: order.fondo_option,
		fondoAmount: order.fondo_amount,
		fondoContribution: order.fondo_contribution,
		subtotal: order.subtotal,
		discountCode: order.discount_code,
		discountAmount: order.discount_amount,
		surcharge: order.surcharge_amount,
		total: order.total,
		buyer: order.buyer_name,
		buyerPronouns: order.buyer_pronouns ?? '',
		email: order.buyer_email,
		dniTail: dniTail(order.buyer_dni),
		createdAt: order.created_at,
		// Cuándo se aprobó: la última actualización de una orden aprobada (MP, transferencia o puerta).
		paidAt: order.status === 'approved' || order.status === 'refunded' ? order.updated_at : null,
		confirmedBy: order.confirmed_by,
		refundedAt: order.refunded_at ?? null,
		tickets: tickets.map((x) => ({
			id: x.id,
			holder: x.holder_name,
			pronouns: x.holder_pronouns ?? '',
			code: x.code ?? '',
			at: x.checked_in_at,
			by: x.checked_in_by
		}))
	};
}

/**
 * DNI completo de quien compró una entrada del evento. Queda en el registro de actividad (sin el
 * número: solo que se vio y de qué orden).
 *
 * @param {D1Database} db
 * @param {App.Locals} locals
 * @param {{ slug: string, ticketId: string }} input
 * @returns {Promise<string | null>} `null` si no existe o no tiene DNI
 */
export async function revealDni(db, locals, { slug, ticketId }) {
	const row = await db
		.prepare(
			`SELECT o.id, o.buyer_dni FROM tickets t JOIN orders o ON o.id = t.order_id
			WHERE t.id = ?1 AND t.event_slug = ?2`
		)
		.bind(ticketId, slug)
		.first();
	if (!row?.buyer_dni) return null;
	await logAdminAction(db, locals, {
		action: 'order.reveal_dni',
		targetType: 'order',
		targetId: String(row.id),
		summary: `Vio el DNI completo de ${orderRef(String(row.id))} en la puerta`,
		detail: { event: slug, ticket: ticketId }
	});
	return String(row.buyer_dni);
}

/**
 * Lista para validar sin conexión: una fila por entrada emitida del evento (también las
 * anuladas, para decir "Anulada" sin conexión). Solo lo mínimo para validar y mostrar: hash del
 * token (no el token), código, persona, tipo, estado, ingreso, quién compró, email, últimos 3 del
 * DNI y si es su primera vez en la serie.
 *
 * @param {D1Database} db
 * @param {{ slug: string, typeNames: Record<string, string>, prior: PriorAttendance | null }} input
 */
export async function offlineList(db, { slug, typeNames, prior }) {
	const { results } = await db
		.prepare(
			`SELECT t.*, o.status AS order_status, o.buyer_name, o.buyer_email, o.buyer_dni,
				o.buyer_pronouns
			FROM tickets t JOIN orders o ON o.id = t.order_id WHERE t.event_slug = ?1
			ORDER BY t.rowid`
		)
		.bind(slug)
		.all();
	const rows = /** @type {TicketWithBuyer[]} */ (results);
	return Promise.all(
		rows.map(async (t) => {
			const card = ticketCard(t, { typeNames, prior });
			return {
				...card,
				hash: await sha256Hex(t.token),
				valid: t.order_status === 'approved'
			};
		})
	);
}

/** @typedef {Awaited<ReturnType<typeof offlineList>>[number]} OfflineTicket */

/** Hasta cuánto tiempo atrás se acepta la hora de un ingreso marcado sin conexión. */
export const QUEUE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** Cuántos ingresos se sincronizan por pedido como máximo. */
export const QUEUE_MAX_ITEMS = 500;

/**
 * @typedef {{ id: string, token?: string, code?: string, at: number }} QueuedCheckIn
 * @typedef {{
 *   id: string,
 *   result: 'ok' | 'duplicate' | 'conflict' | 'void' | 'wrong-event' | 'invalid',
 *   holder?: string, at?: number | null, by?: string | null
 * }} SyncResult
 */

/**
 * Valida la cola que manda el celu (JSON sin confiar): lista de `{ id, token | code, at }`.
 *
 * @param {unknown} raw
 * @returns {QueuedCheckIn[] | null}
 */
export function parseQueue(raw) {
	if (!Array.isArray(raw) || raw.length > QUEUE_MAX_ITEMS) return null;
	/** @type {QueuedCheckIn[]} */
	const out = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') return null;
		const id = String(item.id ?? '').slice(0, 64);
		const token = typeof item.token === 'string' ? item.token.slice(0, 500) : undefined;
		const code = typeof item.code === 'string' ? item.code.slice(0, 40) : undefined;
		const at = Number(item.at);
		if (!id || (!token && !code) || !Number.isFinite(at)) return null;
		out.push({ id, token, code, at });
	}
	return out;
}

/**
 * Aplica los ingresos marcados sin conexión. Idempotente: si el mismo celu reintenta (se cortó
 * la conexión en el medio), la entrada ya tiene ese ingreso (misma hora, misma persona) y da
 * `duplicate`, que el celu toma como hecho. Si otra persona u otro celu la marcó antes, da
 * `conflict` con quién y cuándo (no se pisa: gana el primer ingreso guardado en el servidor).
 *
 * La hora del ingreso es la del celu, acotada a los últimos `QUEUE_MAX_AGE_MS` y a no más que
 * ahora (un reloj adelantado no deja horas en el futuro).
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string, by: string, items: QueuedCheckIn[], now?: number,
 *   resolve: (raw: string) => Promise<string>
 * }} input `resolve`: link, token o código → token (extractToken de checkin.js)
 * @returns {Promise<SyncResult[]>}
 */
export async function applyQueuedCheckIns(db, { eventSlug, by, items, now = Date.now(), resolve }) {
	/** @type {SyncResult[]} */
	const out = [];
	for (const item of items) {
		const at = Math.min(now, Math.max(now - QUEUE_MAX_AGE_MS, Math.round(item.at)));
		const token = await resolve(item.token ?? item.code ?? '');
		if (!isValidToken(token)) {
			out.push({ id: item.id, result: 'invalid' });
			continue;
		}
		const updated = await db
			.prepare(
				`UPDATE tickets SET checked_in_at = ?3, checked_in_by = ?4
				WHERE token = ?1 AND event_slug = ?2 AND checked_in_at IS NULL
					AND (SELECT status FROM orders WHERE id = tickets.order_id) = 'approved'
				RETURNING holder_name`
			)
			.bind(token, eventSlug, at, by)
			.first();
		if (updated) {
			out.push({ id: item.id, result: 'ok', holder: String(updated.holder_name), at, by });
			continue;
		}
		const t = await ticketWithBuyer(db, { token });
		if (!t) out.push({ id: item.id, result: 'invalid' });
		else if (t.event_slug !== eventSlug) out.push({ id: item.id, result: 'wrong-event' });
		else if (t.order_status !== 'approved')
			out.push({ id: item.id, result: 'void', holder: t.holder_name });
		else if (t.checked_in_at === at && t.checked_in_by === by)
			out.push({ id: item.id, result: 'duplicate', holder: t.holder_name, at, by });
		else
			out.push({
				id: item.id,
				result: 'conflict',
				holder: t.holder_name,
				at: t.checked_in_at,
				by: t.checked_in_by
			});
	}
	return out;
}

/**
 * ¿El evento vende entradas en la puerta? Sí, salvo que tenga `puerta: false` (`door.on`
 * false). Sin `puerta` en el frontmatter (eventos de antes) o sin `door` en la llamada, sí.
 *
 * @param {{ door?: { on: boolean } | null } | null | undefined} config
 */
export function doorSalesOpen(config) {
	return config?.door?.on !== false;
}

/** Máximo de entradas por venta en la puerta (une admin lo puede pasar, con confirmación). */
export const MAX_DOOR_SALE = 10;

/**
 * Tope técnico de entradas en una sola orden hecha desde el panel (venta en la puerta o carga a
 * mano). No es un límite de venta (ese se puede pasar): es para que una orden no sea un batch
 * gigante por un error de tipeo. Para más, se hacen varias.
 */
export const PANEL_ORDER_HARD_MAX = 100;

/**
 * Qué límites pasaría esta venta en la puerta (ver overrides.js): evento solo anticipadas,
 * evento cancelado, máximo por venta y cupo del tipo (con las reservas online vigentes). La
 * ventana de venta (`tickets_close`) y "agotadas" no cuentan: la puerta abre cuando el evento
 * empieza, justamente cuando cierra la venta online.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   config: { door?: { on: boolean } | null, status?: string },
 *   type: import('./config.js').TicketType,
 *   quantity: number,
 *   now?: number
 * }} input
 * @returns {Promise<import('./overrides.js').ExceededLimit[]>}
 */
export async function doorSaleLimits(db, { eventSlug, config, type, quantity, now = Date.now() }) {
	const c = (await getCounts(db, eventSlug, now)).get(type.id);
	return /** @type {import('./overrides.js').ExceededLimit[]} */ (
		[
			noDoorLimit(config),
			config.status === 'cancelado' ? closedLimit({ open: false, reason: 'cancelled' }) : null,
			maxPerPurchaseLimit(quantity, MAX_DOOR_SALE),
			capacityLimit(type, c ? c.sold + c.held : 0, quantity)
		].filter(Boolean)
	);
}

/**
 * Lo que se guarda de una venta hecha sin conexión: el id que le puso el celu (único: un reintento
 * no crea otra orden) y los límites que pasó al sincronizarse (van a «Para revisar»).
 *
 * @typedef {{ clientSaleId: string, review?: import('./overrides.js').ExceededLimit[] | null }} OfflineSaleMark
 */

/**
 * Crea una orden YA aprobada desde el panel y emite sus entradas, todo en un batch (una
 * transacción): la usan la venta en la puerta (`sellAtDoor`, canal `puerta`, entradas marcadas
 * adentro) y la carga a mano (`createManualOrder` de manual.js, canal `manual`).
 *
 * El cupo se controla en la misma sentencia que crea la orden, igual que la compra online
 * (`reserveOrder`): cuentan las aprobadas y las reservas vigentes, así que dos ventas a la vez
 * (o una venta online en el mismo momento) no pueden pasarse. Con `override: true` (une admin
 * confirmó en el diálogo que se pasa; ver overrides.js) no se controla el cupo.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   type: { id: string, capacity: number | null },
 *   quantity: number,
 *   holders: import('./config.js').Holder[],
 *   buyer: { name: string, pronouns?: string, email?: string, dni?: string | null },
 *   method: import('./orders.js').OrderPaymentMethod,
 *   unitPrice: number,
 *   prices: ReturnType<typeof computePrice>,
 *   fondoPercent?: number | null,
 *   channel: 'puerta' | 'manual',
 *   note?: string | null,
 *   checkIn?: boolean,
 *   override?: boolean,
 *   offline?: OfflineSaleMark | null,
 *   by: string,
 *   now: number
 * }} input `offline`: venta hecha sin conexión (ver `applyQueuedSales`)
 * @returns {Promise<{ ok: true, order: Order, tickets: Ticket[] } | { ok: false }>}
 */
export async function insertApprovedOrder(db, input) {
	const { eventSlug, type, quantity, holders, buyer, prices, by, now } = input;
	if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > PANEL_ORDER_HARD_MAX) {
		throw new Error('Cantidad inválida');
	}
	if (holders.length !== quantity) throw new Error('Falta la información de alguna entrada');
	const offline = input.offline ?? null;
	const id = crypto.randomUUID();
	const [inserted] = await db.batch([
		db
			.prepare(
				`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal,
					discount_amount, total, payment_method, buyer_name, buyer_email, holders, status,
					created_at, updated_at, expires_at, fondo_amount, surcharge_amount, buyer_dni,
					fondo_option, fondo_contribution, buyer_pronouns, fondo_percent, confirmed_by,
					channel, admin_note${offline ? ', client_sale_id, offline_review' : ''})
				SELECT ?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11, 'approved', ?12, ?12, ?12,
					?13, 0, ?14, ?15, ?16, ?17, ?18, ?19, ?21, ?22${offline ? ', ?24, ?25' : ''}
				WHERE ?23 = 1 OR ?20 IS NULL OR (
					SELECT COALESCE(SUM(quantity), 0) FROM orders
					WHERE event_slug = ?2 AND ticket_type = ?3
						AND (status = 'approved' OR (status IN ${HOLDING} AND expires_at > ?12))
				) + ?4 <= ?20
				RETURNING *`
			)
			.bind(
				id,
				eventSlug,
				type.id,
				quantity,
				input.unitPrice,
				prices.subtotal,
				prices.total,
				input.method,
				buyer.name,
				(buyer.email ?? '').trim().toLowerCase(),
				JSON.stringify(holders),
				now,
				prices.fondo,
				buyer.dni || null,
				prices.option,
				prices.contribution,
				buyer.pronouns || null,
				input.fondoPercent ?? null,
				by,
				type.capacity,
				input.channel,
				input.note || null,
				input.override ? 1 : 0,
				// Venta sin conexión (migración 0051): las columnas nuevas solo se nombran cuando hay
				// una, así la venta de siempre y la carga a mano no dependen de la migración.
				...(offline
					? [offline.clientSaleId, offline.review?.length ? JSON.stringify(offline.review) : null]
					: [])
			),
		...issueTicketsStatements(db, {
			id,
			holders: JSON.stringify(holders),
			buyer_name: buyer.name,
			quantity
		}),
		...(input.checkIn
			? [
					db
						.prepare(
							`UPDATE tickets SET checked_in_at = ?2, checked_in_by = ?3
							WHERE order_id = ?1 AND checked_in_at IS NULL`
						)
						.bind(id, now, by)
				]
			: [])
	]);
	const order = /** @type {Order | undefined} */ (inserted.results[0]);
	if (!order) return { ok: false };
	const { results } = await db
		.prepare('SELECT * FROM tickets WHERE order_id = ?1 ORDER BY rowid')
		.bind(id)
		.all();
	return {
		ok: true,
		order: { ...order, holders: null },
		tickets: /** @type {Ticket[]} */ (results)
	};
}

/**
 * Vende entradas en la puerta: crea una orden YA aprobada (cobrada en efectivo o por
 * transferencia en el momento), emite las entradas y las marca como ingresadas, todo en un
 * batch (una transacción; ver `insertApprovedOrder`). El cupo se controla en la misma sentencia
 * que crea la orden.
 *
 * No aplica los topes por email ni la ventana de venta (`tickets_close`): la puerta abre cuando
 * el evento empieza y quien vende es admin. Tampoco códigos de descuento.
 *
 * No vende si el evento dice que no hay entradas en la puerta (`puerta: false` en el frontmatter,
 * `door.on` false en la configuración): `{ ok: false, reason: 'no-door' }` sin tocar la base. Un tipo sin
 * cupo (`capacity: null`) no tiene límite.
 *
 * Precio (salvo a la gorra): el de `doorPrice` ($lib/utils/ticketTiers.js), o sea el precio en la
 * puerta del tipo (`door_price`) si tiene uno y, si no, el del último tramo (o el precio fijo). No gasta
 * lugares de los tramos (`ticket_tier` NULL), pero sí cuenta para el cupo.
 *
 * Con `override: true` (solo desde el panel, después de confirmar en el diálogo los límites que
 * da `doorSaleLimits`) vende igual aunque se pase del cupo o el evento sea solo anticipadas.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   door?: { on: boolean } | null,
 *   type: import('./config.js').TicketType,
 *   quantity: number,
 *   holders: import('./config.js').Holder[],
 *   buyer: { name: string, pronouns?: string, email?: string, dni?: string | null },
 *   method: 'efectivo' | 'transferencia',
 *   option?: import('$lib/utils/tickets.js').PriceOption,
 *   unitPrice?: number,
 *   fondoPercent?: number | null,
 *   override?: boolean,
 *   offline?: OfflineSaleMark | null,
 *   by: string,
 *   now?: number
 * }} input
 * @returns {Promise<{ ok: true, order: Order, tickets: Ticket[] }
 *   | { ok: false, reason: 'soldout', available: number | null }
 *   | { ok: false, reason: 'no-door' }
 *   | { ok: false, reason: 'free-door' }>}
 */
export async function sellAtDoor(db, input) {
	const { eventSlug, type, quantity, holders, buyer, by, now = Date.now() } = input;
	if (!input.override && !doorSalesOpen(input)) return { ok: false, reason: 'no-door' };
	if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Cantidad inválida');
	if (holders.length !== quantity) throw new Error('Falta la información de alguna entrada');
	const gorra = Boolean(type.gorra);
	const atDoor = doorPrice(type);
	const price = gorra || !atDoor ? Number(input.unitPrice) : atDoor.price;
	// La configuración acepta `door_price: 0`, pero la puerta no vende sin cargo: la orden no se
	// puede guardar (un precio 0 fuera de «a la gorra»). Se avisa antes de tocar la base, para que
	// la carguen a mano. Un precio fijo es siempre ≥ 1.
	const min = gorra ? (type.gorra?.min ?? 0) : atDoor?.source === 'door' ? 0 : 1;
	if (!Number.isSafeInteger(price) || price < min) {
		throw new Error('Precio por entrada inválido');
	}
	if (!gorra && price === 0) return { ok: false, reason: 'free-door' };
	const prices = computePrice({
		price,
		fondo: gorra || !atDoor ? 0 : atDoor.fondo,
		option: gorra ? 'gorra' : input.option,
		quantity,
		discount: null,
		method: input.method
	});
	// Un total 0 (a la gorra con mínimo 0) queda "sin cargo", como en la compra online.
	const method = prices.total === 0 ? 'gratis' : input.method;
	const r = await insertApprovedOrder(db, {
		eventSlug,
		type,
		quantity,
		holders,
		buyer,
		method,
		unitPrice: price,
		prices,
		fondoPercent: gorra ? null : (input.fondoPercent ?? null),
		channel: 'puerta',
		checkIn: true,
		override: input.override,
		offline: input.offline ?? null,
		by,
		now
	});
	if (!r.ok) {
		const c = (await getCounts(db, eventSlug, now)).get(type.id);
		return { ok: false, reason: 'soldout', available: remainingOf(type, c) };
	}
	return r;
}

/**
 * Una venta en la puerta ya validada (lo que `sellAtDoor` necesita además del evento y quién).
 *
 * @typedef {{
 *   type: import('./config.js').TicketType,
 *   quantity: number,
 *   method: 'efectivo' | 'transferencia',
 *   option?: import('$lib/utils/tickets.js').PriceOption,
 *   unitPrice?: number,
 *   holders: import('./config.js').Holder[],
 *   buyer: { name: string, pronouns: string, email: string, dni: string | null },
 *   sendEmail: boolean
 * }} DoorSaleInput
 */

/**
 * Valida los campos de «Vender en puerta» (los del formulario: `type`, `quantity`, `method`,
 * `name`, `email`, `dni`, `amount` u `option`, `pronouns`, `holder_N`, `pronouns_N`,
 * `send_email`). La usan la venta con conexión (acción `sell`) y la sincronización de las ventas
 * hechas sin conexión (`applyQueuedSales`), así las dos aceptan exactamente lo mismo.
 *
 * @param {{ types: import('./config.js').TicketType[] }} config
 * @param {(name: string) => unknown} get el valor de un campo (FormData.get o un objeto)
 * @returns {{ ok: true, sale: DoorSaleInput } | { ok: false, message: string }}
 */
export function parseDoorSale(config, get) {
	const text = (/** @type {string} */ name, max = 120) =>
		String(get(name) ?? '')
			.trim()
			.slice(0, max);
	/** @param {string} message */
	const bad = (message) => /** @type {const} */ ({ ok: false, message });
	const type = config.types.find((t) => t.id === text('type', 64));
	if (!type) return bad('Elegí un tipo de entrada.');
	const quantity = Number(text('quantity', 3));
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > PANEL_ORDER_HARD_MAX) {
		return bad(`La cantidad tiene que ser de 1 a ${PANEL_ORDER_HARD_MAX}.`);
	}
	const method = text('method', 20);
	if (method !== 'efectivo' && method !== 'transferencia') {
		return bad('Elegí cómo pagó: efectivo o transferencia.');
	}
	const name = text('name');
	if (!name) return bad('Falta el nombre de quien compra.');
	const email = text('email', 200).toLowerCase();
	if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('El email no es válido.');
	const dniRaw = text('dni', 20);
	const dni = dniRaw ? normalizeDni(dniRaw) : null;
	if (dniRaw && !dni) return bad('El DNI tiene que tener 7 a 9 números.');
	/** @type {import('$lib/utils/tickets.js').PriceOption | undefined} */
	let option;
	/** @type {number | undefined} */
	let unitPrice;
	if (type.gorra) {
		// El mismo criterio que la compra online (`parseAmount`): «5.000», «$ 5.000» y «5000,00»
		// son 5000; «5000.00» o «5.5» no se adivinan (antes «5000.00» quedaba en $ 500.000).
		const amount = parseAmount(text('amount', 14));
		if (amount === null) {
			return bad('Escribí el monto por entrada en pesos, sin centavos (por ejemplo 5.000).');
		}
		if (amount < type.gorra.min) {
			return bad(`El monto por entrada tiene que ser de al menos $ ${type.gorra.min}.`);
		}
		if (exceedsOrderMax(amount, quantity)) return bad(ORDER_MAX_MESSAGE);
		unitPrice = amount;
	} else {
		const o = text('option', 20);
		option = isFondoOption(o) ? /** @type {any} */ (o) : undefined;
		if (option === 'fondo' && !((doorPrice(type)?.fondo ?? 0) > 0)) option = undefined;
	}
	const holders = Array.from({ length: quantity }, (_, i) => ({
		name: text(`holder_${i}`) || name,
		pronouns: i === 0 ? text('pronouns', 40) : text(`pronouns_${i}`, 40)
	}));
	return {
		ok: true,
		sale: {
			type,
			quantity,
			method,
			option,
			unitPrice,
			holders,
			buyer: { name, pronouns: text('pronouns', 40), email, dni },
			sendEmail: Boolean(email) && (get('send_email') === 'on' || get('send_email') === true)
		}
	};
}

/** Cuántas ventas sin conexión se sincronizan por pedido como máximo. */
export const SALE_QUEUE_MAX_ITEMS = 100;

/** Campos de una venta sin conexión que se aceptan (los del formulario de «Vender en puerta»). */
const SALE_FIELD_RE =
	/^(type|quantity|method|option|amount|name|pronouns|email|send_email|transfer_seen|holder_\d{1,3}|pronouns_\d{1,3})$/;

/**
 * Una venta hecha sin conexión, esperando para sincronizar: el id que le puso el celu, la hora
 * del celu y los campos del formulario (sin el DNI: sin conexión no se guarda en el celu).
 *
 * @typedef {{ id: string, at: number, fields: Record<string, string> }} QueuedSale
 */

/**
 * @typedef {{
 *   id: string,
 *   result: 'ok' | 'duplicate' | 'rejected',
 *   orderId?: string, ref?: string, buyer?: string, quantity?: number, type?: string,
 *   total?: number, method?: string, message?: string, review?: string[]
 * }} SaleSyncResult `review`: los límites que pasó (texto), si pasó alguno
 */

/**
 * Valida la cola de ventas que manda el celu (JSON sin confiar). Solo la forma: lo que vale cada
 * campo lo decide `parseDoorSale` al aplicarla.
 *
 * @param {unknown} raw
 * @returns {QueuedSale[] | null}
 */
export function parseSaleQueue(raw) {
	if (!Array.isArray(raw) || raw.length > SALE_QUEUE_MAX_ITEMS) return null;
	/** @type {QueuedSale[]} */
	const out = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') return null;
		const id = String(item.id ?? '');
		const at = Number(item.at);
		if (!/^[A-Za-z0-9_-]{8,64}$/.test(id) || !Number.isFinite(at)) return null;
		if (!item.fields || typeof item.fields !== 'object') return null;
		/** @type {Record<string, string>} */
		const fields = {};
		for (const [k, v] of Object.entries(item.fields)) {
			if (SALE_FIELD_RE.test(k)) fields[k] = String(v ?? '').slice(0, 200);
		}
		out.push({ id, at, fields });
	}
	return out;
}

/**
 * La orden que ya se creó para una venta sin conexión, si existe.
 *
 * @param {D1Database} db
 * @param {string} clientSaleId
 * @returns {Promise<Order | null>}
 */
async function orderByClientSaleId(db, clientSaleId) {
	return /** @type {Order | null} */ (
		await db.prepare('SELECT * FROM orders WHERE client_sale_id = ?1').bind(clientSaleId).first()
	);
}

/**
 * Límites que pasó una venta sin conexión, como texto (de `offline_review`).
 * @param {string | null | undefined} json
 */
export function offlineReviewMessages(json) {
	if (!json) return [];
	try {
		const list = JSON.parse(json);
		return Array.isArray(list) ? list.map((l) => limitMessage(l)) : [];
	} catch {
		return [];
	}
}

/**
 * Resumen corto de lo que pasó una venta sin conexión (para «Para revisar»).
 * @param {string | null | undefined} json
 */
export function offlineReviewSummary(json) {
	if (!json) return '';
	try {
		const list = JSON.parse(json);
		return Array.isArray(list) ? list.map((l) => limitSummary(l)).join('; ') : '';
	} catch {
		return '';
	}
}

/**
 * Registra las ventas que se hicieron sin conexión en la puerta, **en el orden en que se
 * hicieron**, con la misma función que la venta con conexión (`sellAtDoor`).
 *
 * - **Idempotente**: cada venta trae un id del celu (`client_sale_id`, único en la base). Si ya hay
 *   una orden con ese id (el celu reintentó porque se cortó en el medio), da `duplicate` con esa
 *   orden y no crea otra. Si dos pedidos llegan a la vez, el índice único hace fallar al segundo
 *   (la tanda entera se deshace) y también da `duplicate`.
 * - **Nunca se pierde una venta por un límite**: si ahora se pasa del cupo, el tipo se agotó
 *   mientras tanto, son más de 10, el evento es solo anticipadas o se canceló, la venta se guarda
 *   igual (decide quien organiza, decisión 0035) y esos límites quedan en `offline_review`: la
 *   orden sale en «Para revisar» y el celu muestra un aviso.
 * - Solo da `rejected` si los datos no sirven para crear una orden (un tipo que ya no existe, un
 *   monto inválido): el celu la deja a la vista, no la borra.
 *
 * La hora de la venta (y del ingreso) es la del celu, acotada como la de los ingresos sin conexión
 * (últimos `QUEUE_MAX_AGE_MS`, nunca en el futuro).
 *
 * @param {D1Database} db
 * @param {App.Locals} locals para el registro de actividad
 * @param {{
 *   eventSlug: string,
 *   config: { types: import('./config.js').TicketType[], door?: { on: boolean } | null, status?: string },
 *   fondoPercent?: number | null,
 *   by: string,
 *   items: QueuedSale[],
 *   now?: number,
 *   onSold?: (r: { order: Order, tickets: Ticket[], sale: DoorSaleInput }) => Promise<void> | void
 * }} input `onSold`: después de cada venta nueva (para mandar el mail)
 * @returns {Promise<SaleSyncResult[]>}
 */
export async function applyQueuedSales(db, locals, input) {
	const { eventSlug, config, by, items, now = Date.now() } = input;
	/** @type {SaleSyncResult[]} */
	const out = [];
	/** @param {string} id @param {Order} o */
	const duplicate = (id, o) => ({
		id,
		result: /** @type {const} */ ('duplicate'),
		orderId: o.id,
		ref: orderRef(o.id),
		buyer: o.buyer_name,
		quantity: o.quantity,
		total: o.total,
		method: o.payment_method,
		review: offlineReviewMessages(/** @type {any} */ (o).offline_review)
	});
	for (const item of items) {
		const existing = await orderByClientSaleId(db, item.id);
		if (existing) {
			out.push(duplicate(item.id, existing));
			continue;
		}
		const parsed = parseDoorSale(config, (name) => item.fields[name]);
		if (!parsed.ok) {
			out.push({ id: item.id, result: 'rejected', message: parsed.message });
			continue;
		}
		const { sale } = parsed;
		const soldAt = Math.min(now, Math.max(now - QUEUE_MAX_AGE_MS, Math.round(item.at)));
		const limits = await doorSaleLimits(db, {
			eventSlug,
			config,
			type: sale.type,
			quantity: sale.quantity,
			now
		});
		/** @type {Awaited<ReturnType<typeof sellAtDoor>>} */
		let r;
		try {
			r = await sellAtDoor(db, {
				eventSlug,
				door: config.door,
				// Sin conexión no hubo a quién preguntarle: se vende igual y queda para revisar.
				override: true,
				offline: { clientSaleId: item.id, review: limits },
				type: sale.type,
				quantity: sale.quantity,
				holders: sale.holders,
				buyer: sale.buyer,
				method: sale.method,
				option: sale.option,
				unitPrice: sale.unitPrice,
				fondoPercent: input.fondoPercent ?? null,
				by,
				now: soldAt
			});
		} catch (e) {
			// El índice único de `client_sale_id`: otro pedido con la misma venta llegó primero.
			const again = await orderByClientSaleId(db, item.id);
			if (again) out.push(duplicate(item.id, again));
			else
				out.push({
					id: item.id,
					result: 'rejected',
					message: e instanceof Error && e.message ? e.message : 'No se pudo registrar.'
				});
			continue;
		}
		if (!r.ok) {
			// Con `override` el cupo y la puerta no frenan; una entrada sin cargo en la puerta, sí.
			out.push({
				id: item.id,
				result: 'rejected',
				message: r.reason === 'free-door' ? FREE_DOOR_MESSAGE : 'No se pudo registrar.'
			});
			continue;
		}
		await logAdminAction(db, locals, {
			action: 'order.door_sale',
			targetType: 'order',
			targetId: r.order.id,
			summary: `Vendió en la puerta sin conexión ${sale.quantity} × ${sale.type.name} (${orderRef(r.order.id)}, ${r.order.payment_method})`,
			detail: {
				event: eventSlug,
				type: sale.type.id,
				quantity: sale.quantity,
				method: r.order.payment_method,
				total: r.order.total,
				offline: true,
				soldAt,
				...(sale.method === 'transferencia'
					? { transferSeen: item.fields.transfer_seen === 'on' }
					: {}),
				...(limits.length ? { overrides: limits } : {})
			}
		});
		await logOverride(db, locals, {
			event: eventSlug,
			what: 'venta en la puerta sin conexión',
			orderId: r.order.id,
			limits
		});
		await input.onSold?.({ order: r.order, tickets: r.tickets, sale });
		out.push({
			id: item.id,
			result: 'ok',
			orderId: r.order.id,
			ref: orderRef(r.order.id),
			buyer: r.order.buyer_name,
			quantity: sale.quantity,
			type: sale.type.name,
			total: r.order.total,
			method: r.order.payment_method,
			review: limits.map((l) => limitMessage(l))
		});
	}
	return out;
}

const TZ = 'America/Argentina/Buenos_Aires';
/** Un evento de hasta hace 60 días sale en "Recientes" en /admin/checkin. */
const RECENT_MS = 60 * 24 * 60 * 60 * 1000;
/** Un evento que empezó hace menos de esto sigue siendo "hoy" (fiestas que pasan la medianoche). */
const RUNNING_MS = 12 * 60 * 60 * 1000;

/** @param {number} ms */
const dayOf = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });

/**
 * En qué grupo de /admin/checkin va un evento según su comienzo: hoy (mismo día en Argentina o
 * empezó hace menos de 12 horas), próximos, recientes (últimos 60 días) o ninguno.
 *
 * @param {number | null} start
 * @param {number} now
 * @returns {'hoy' | 'proximos' | 'recientes' | null}
 */
export function checkinGroup(start, now) {
	if (start === null) return null;
	if (dayOf(start) === dayOf(now) || (start <= now && now - start < RUNNING_MS)) return 'hoy';
	if (start > now) return 'proximos';
	if (now - start <= RECENT_MS) return 'recientes';
	return null;
}

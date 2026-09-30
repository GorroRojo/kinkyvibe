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
 *   en eventos con `puerta: false` (ver `doorSalesOpen`).
 *
 * Privacidad: el DNI completo nunca va en la lista sin conexión ni en el escaneo (solo los
 * últimos 3 dígitos); se pide aparte y se registra quién lo vio.
 */
import { computePrice, remainingOf } from '$lib/utils/tickets.js';
import { logAdminAction } from '$lib/server/admin/audit.js';
import { HOLDING } from './discounts.js';
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
 * SHA-256 en hex (el celu guarda el hash del token, no el token, en la lista sin conexión).
 * @param {string} text
 */
export async function sha256Hex(text) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

/**
 * Vende entradas en la puerta: crea una orden YA aprobada (cobrada en efectivo o por
 * transferencia en el momento), emite las entradas y las marca como ingresadas, todo en un
 * batch (una transacción). El cupo se controla en la misma sentencia que crea la orden, igual
 * que la compra online (`reserveOrder`): cuentan las aprobadas y las reservas vigentes, así que
 * dos ventas a la vez (o una venta online en el mismo momento) no pueden pasarse.
 *
 * No aplica los topes por email ni la ventana de venta (`tickets_close`): la puerta abre cuando
 * el evento empieza y quien vende es admin. Tampoco códigos de descuento.
 *
 * No vende si el evento dice que no hay entradas en la puerta (`puerta: false` en el frontmatter,
 * `door.on` false en la configuración): `{ ok: false, reason: 'no-door' }` sin tocar la base. Un tipo sin
 * cupo (`capacity: null`) no tiene límite.
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
 *   by: string,
 *   now?: number
 * }} input
 * @returns {Promise<{ ok: true, order: Order, tickets: Ticket[] }
 *   | { ok: false, reason: 'soldout', available: number | null }
 *   | { ok: false, reason: 'no-door' }>}
 */
export async function sellAtDoor(db, input) {
	const { eventSlug, type, quantity, holders, buyer, by, now = Date.now() } = input;
	if (!doorSalesOpen(input)) return { ok: false, reason: 'no-door' };
	if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Cantidad inválida');
	if (holders.length !== quantity) throw new Error('Falta la información de alguna entrada');
	const gorra = Boolean(type.gorra);
	const price = gorra ? Number(input.unitPrice) : type.price;
	if (!Number.isSafeInteger(price) || price < (gorra ? (type.gorra?.min ?? 0) : 1)) {
		throw new Error('Precio por entrada inválido');
	}
	const prices = computePrice({
		price,
		fondo: gorra ? 0 : (type.fondo ?? 0),
		option: gorra ? 'gorra' : input.option,
		quantity,
		discount: null,
		method: input.method
	});
	// Un total 0 (a la gorra con mínimo 0) queda "sin cargo", como en la compra online.
	const method = prices.total === 0 ? 'gratis' : input.method;
	const id = crypto.randomUUID();
	const [inserted] = await db.batch([
		db
			.prepare(
				`INSERT INTO orders (id, event_slug, ticket_type, quantity, unit_price, subtotal,
					discount_amount, total, payment_method, buyer_name, buyer_email, holders, status,
					created_at, updated_at, expires_at, fondo_amount, surcharge_amount, buyer_dni,
					fondo_option, fondo_contribution, buyer_pronouns, fondo_percent, confirmed_by,
					channel)
				SELECT ?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9, ?10, ?11, 'approved', ?12, ?12, ?12,
					?13, 0, ?14, ?15, ?16, ?17, ?18, ?19, 'puerta'
				WHERE ?20 IS NULL OR (
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
				price,
				prices.subtotal,
				prices.total,
				method,
				buyer.name,
				(buyer.email ?? '').trim().toLowerCase(),
				JSON.stringify(holders),
				now,
				prices.fondo,
				buyer.dni || null,
				prices.option,
				prices.contribution,
				buyer.pronouns || null,
				gorra ? null : (input.fondoPercent ?? null),
				by,
				type.capacity
			),
		...issueTicketsStatements(db, {
			id,
			holders: JSON.stringify(holders),
			buyer_name: buyer.name,
			quantity
		}),
		db
			.prepare(
				`UPDATE tickets SET checked_in_at = ?2, checked_in_by = ?3
				WHERE order_id = ?1 AND checked_in_at IS NULL`
			)
			.bind(id, now, by)
	]);
	const order = /** @type {Order | undefined} */ (inserted.results[0]);
	if (!order) {
		const c = (await getCounts(db, eventSlug, now)).get(type.id);
		return { ok: false, reason: 'soldout', available: remainingOf(type, c) };
	}
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

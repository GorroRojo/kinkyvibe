/**
 * Propinas al pie de las publicaciones de KinkyVibe (docs/propinas.md).
 *
 * Usa la MISMA integración de Mercado Pago que las entradas: el cliente (`getGateway`), la cuenta
 * (MP_ACCESS_TOKEN), el webhook firmado (/api/mercadopago/webhook, que reconoce las propinas por
 * el prefijo `propina:` del `external_reference`) y la máquina de estados de los pagos
 * (`mapPaymentStatus` / `nextStatus` de tickets/orders.js). La plata siempre entra a la cuenta de
 * MP de las entradas. Quien deja la propina elige el destino (`destination`): "Para KinkyVibe"
 * (por defecto) o "Para el Fondo"; las del Fondo aprobadas se cuentan como aportes al Fondo
 * KinkyVibe (`fondoTipTotals`, que usa el Inicio del panel), igual que el aporte de una entrada
 * solidaria. Solo cambia cómo se cuenta, no a dónde va la plata.
 *
 * El navegador solo manda el monto elegido, el mensaje y desde qué publicación: el monto lo valida
 * el servidor y el estado lo cambia solo un pago pedido a la API de MP (nunca el navegador).
 */
import { checkoutProPreference } from '$lib/server/tickets/mercadopago.js';
import { mapPaymentStatus, nextStatus } from '$lib/server/tickets/orders.js';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { TIP_DESTINATION_LABELS, TIP_STATUS_LABELS } from '$lib/utils/propinas.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {'pending' | 'approved' | 'rejected' | 'refunded'} TipStatus */
/** @typedef {import('$lib/utils/propinas.js').TipDestination} TipDestination */
/**
 * @typedef {{
 *   id: string, amount: number, status: TipStatus, post_category: 'material' | 'calendario',
 *   post_slug: string, message: string | null, mp_preference_id: string | null,
 *   mp_payment_id: string | null, created_at: number, updated_at: number,
 *   approved_at: number | null, destination: TipDestination
 * }} Tip
 */

/** Prefijo del `external_reference` de MP: así el webhook distingue propinas de órdenes. */
export const TIP_REF_PREFIX = 'propina:';

/** Cuánto vale el link de pago de MP de una propina. */
export const TIP_PREFERENCE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Límites anti-abuso para crear propinas (cada una crea una preferencia en MP). Por cliente (hash
 * de la conexión, como en la compra de entradas) y un techo general holgado.
 */
export const TIP_RATE_LIMITS = {
	client: { limit: 10, windowSeconds: 10 * 60 },
	global: { limit: 300, windowSeconds: 60 * 60 }
};

const TIP_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** @param {unknown} id */
export function isValidTipId(id) {
	return typeof id === 'string' && TIP_ID_RE.test(id);
}

/** @param {string} id */
export function tipReference(id) {
	return TIP_REF_PREFIX + id;
}

/** @param {unknown} ref */
export function isTipReference(ref) {
	return typeof ref === 'string' && ref.startsWith(TIP_REF_PREFIX);
}

/**
 * Id de la propina de un `external_reference`, o `null` si no es de una propina.
 * @param {unknown} ref
 */
export function tipIdFromReference(ref) {
	if (!isTipReference(ref)) return null;
	const id = /** @type {string} */ (ref).slice(TIP_REF_PREFIX.length);
	return isValidTipId(id) ? id : null;
}

/**
 * Cuerpo de la preferencia de Checkout Pro para una propina. Sin `payer`: no pedimos datos de
 * quien deja la propina (MP pide lo que necesite en su checkout).
 *
 * @param {{ tip: Pick<Tip, 'id' | 'amount' | 'created_at'> & { destination?: TipDestination }, postTitle: string, origin: string }} input
 */
export function buildTipPreference({ tip, postTitle, origin }) {
	const forWho = tip.destination === 'fondo' ? 'el Fondo KinkyVibe' : 'KinkyVibe';
	return checkoutProPreference({
		items: [
			{
				id: 'propina',
				title: `Propina para ${forWho} · ${postTitle}`,
				quantity: 1,
				unit_price: tip.amount,
				currency_id: 'ARS'
			}
		],
		externalReference: tipReference(tip.id),
		backUrl: `${origin}/propinas/${tip.id}/gracias`,
		from: tip.created_at,
		to: tip.created_at + TIP_PREFERENCE_TTL_MS
	});
}

/**
 * Guarda una propina pendiente (antes de mandar a la persona a MP).
 *
 * @param {D1Database} db
 * @param {{ amount: number, message: string | null, category: 'material' | 'calendario', slug: string, destination?: TipDestination }} input
 *   `destination` ya validado (`validateTip`); si no viene, "Para KinkyVibe".
 * @param {{ now?: number }} [opts]
 * @returns {Promise<Tip>}
 */
export async function createTip(
	db,
	{ amount, message, category, slug, destination = 'kinkyvibe' },
	{ now = Date.now() } = {}
) {
	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO tips (id, amount, status, post_category, post_slug, message, destination, created_at, updated_at)
			VALUES (?1, ?2, 'pending', ?3, ?4, ?5, ?6, ?7, ?7)`
		)
		.bind(id, amount, category, slug, message, destination, now)
		.run();
	return /** @type {Tip} */ (await getTip(db, id));
}

/**
 * @param {D1Database} db
 * @param {string} id
 * @returns {Promise<Tip | null>}
 */
export async function getTip(db, id) {
	if (!isValidTipId(id)) return null;
	const row = await db.prepare('SELECT * FROM tips WHERE id = ?1').bind(id).first();
	return /** @type {Tip | null} */ (row ?? null);
}

/**
 * @param {D1Database} db
 * @param {string} id
 * @param {string} preferenceId
 */
export async function setTipPreference(db, id, preferenceId) {
	await db
		.prepare('UPDATE tips SET mp_preference_id = ?2 WHERE id = ?1')
		.bind(id, preferenceId)
		.run();
}

/**
 * Borra una propina que nunca llegó a MP (no se pudo crear la preferencia).
 * @param {D1Database} db
 * @param {string} id
 */
export async function discardTip(db, id) {
	await db
		.prepare("DELETE FROM tips WHERE id = ?1 AND status = 'pending' AND mp_payment_id IS NULL")
		.bind(id)
		.run();
}

/**
 * Estado de una propina según el estado de un pago de MP: los de las órdenes, con `cancelled`
 * como `rejected` y `pending` como "sin cambios" (la propina ya está pendiente).
 *
 * @param {string} mpStatus
 * @returns {'approved' | 'rejected' | 'refunded' | null}
 */
export function tipStatusFromPayment(mpStatus) {
	const s = mapPaymentStatus(mpStatus);
	if (s === 'cancelled') return 'rejected';
	if (s === 'approved' || s === 'rejected' || s === 'refunded') return s;
	return null;
}

/**
 * Aplica un pago (ya pedido a la API de MP, NUNCA tomado del body del webhook ni del navegador) a
 * su propina. Idempotente; mismas reglas que las órdenes (`nextStatus`): aprobado gana salvo sobre
 * reembolsado, una aprobada solo pasa a reembolsada por el mismo pago, reembolsada es final.
 *
 * @param {D1Database} db
 * @param {import('$lib/server/tickets/orders.js').MPPayment} payment
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ outcome: 'unknown-tip' | 'mismatch' | 'unchanged' | 'updated', tip: Tip | null, newlyApproved: boolean }>}
 */
export async function applyTipPayment(db, payment, { now = Date.now() } = {}) {
	const paymentId = String(payment.id);
	const id = tipIdFromReference(payment.external_reference);
	const tip = id ? await getTip(db, id) : null;
	if (!tip) return { outcome: 'unknown-tip', tip: null, newlyApproved: false };
	if (payment.currency_id !== 'ARS' || Number(payment.transaction_amount) !== tip.amount) {
		console.error(
			`[propinas] pago ${paymentId} no coincide con la propina ${tip.id}: ` +
				`${payment.transaction_amount} ${payment.currency_id} ≠ ${tip.amount} ARS`
		);
		return { outcome: 'mismatch', tip, newlyApproved: false };
	}
	const incoming = tipStatusFromPayment(payment.status);
	let current = tip;
	for (let attempt = 0; attempt < 3; attempt++) {
		const next =
			incoming &&
			/** @type {TipStatus | null} */ (
				nextStatus(current.status, current.mp_payment_id, incoming, paymentId)
			);
		if (!next) {
			if (
				incoming === 'approved' &&
				current.status === 'approved' &&
				current.mp_payment_id !== paymentId
			) {
				console.error(
					`[propinas] otro pago aprobado (${paymentId}) para la propina ${tip.id}, ya pagada con ${current.mp_payment_id}: revisar en MP`
				);
			}
			return { outcome: 'unchanged', tip: current, newlyApproved: false };
		}
		const res = await db
			.prepare(
				`UPDATE tips SET status = ?3, mp_payment_id = ?4, updated_at = ?5,
					approved_at = CASE WHEN ?3 = 'approved' THEN ?5 ELSE approved_at END
				WHERE id = ?1 AND status = ?2`
			)
			.bind(tip.id, current.status, next, paymentId, now)
			.run();
		const fresh = /** @type {Tip} */ (await getTip(db, tip.id));
		if (res.meta.changes === 1) {
			return { outcome: 'updated', tip: fresh, newlyApproved: next === 'approved' };
		}
		// Otra notificación cambió la propina en paralelo: se recalcula con el estado nuevo.
		current = fresh;
	}
	return { outcome: 'unchanged', tip: current, newlyApproved: false };
}

/* ------------------------------------- Panel ------------------------------------- */

/** Huso de Argentina (sin horario de verano) para agrupar por mes. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Las propinas que cuentan como aportes al Fondo KinkyVibe: aprobadas y "Para el Fondo" (ni
 * pendientes, ni rechazadas, ni reembolsadas, ni las de KinkyVibe). Una sola definición para el
 * panel de propinas y para los aportes al Fondo del Inicio.
 */
export const FONDO_TIP_WHERE = "status = 'approved' AND destination = 'fondo'";

/**
 * Suma de las propinas al Fondo aprobadas, opcionalmente entre dos fechas de aprobación
 * (`from` inclusive, `to` exclusive, ms). Es lo que se suma a los aportes al Fondo, como
 * `orders.fondo_contribution` de las entradas solidarias.
 *
 * @param {D1Database} db
 * @param {{ from?: number, to?: number }} [range]
 * @returns {Promise<{ count: number, total: number }>}
 */
export async function fondoTipTotals(db, range = {}) {
	return readFondoTipTotals(await fondoTipTotalsStatement(db, range).first());
}

/**
 * La consulta de {@link fondoTipTotals} (para correrla en una tanda).
 *
 * @param {D1Database} db
 * @param {{ from?: number, to?: number }} [range]
 */
export function fondoTipTotalsStatement(db, { from = 0, to = Number.MAX_SAFE_INTEGER } = {}) {
	return db
		.prepare(
			`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM tips
			WHERE ${FONDO_TIP_WHERE} AND approved_at >= ?1 AND approved_at < ?2`
		)
		.bind(from, to);
}

/** @param {Record<string, unknown> | null | undefined} row */
export function readFondoTipTotals(row) {
	return { count: Number(row?.count ?? 0), total: Number(row?.total ?? 0) };
}

/**
 * Totales de las propinas aprobadas: en total, por destino, por mes (hora de Argentina, por fecha
 * de aprobación) y por publicación.
 *
 * @param {D1Database} db
 */
export async function tipSummary(db) {
	const [totals, byMonth, byPost, others, byDestination] = await db.batch([
		db.prepare(
			"SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM tips WHERE status = 'approved'"
		),
		db
			.prepare(
				`SELECT strftime('%Y-%m', (approved_at - ?1) / 1000, 'unixepoch') AS month,
					COUNT(*) AS count, SUM(amount) AS total
				FROM tips WHERE status = 'approved' GROUP BY month ORDER BY month DESC LIMIT 24`
			)
			.bind(AR_OFFSET_MS),
		db.prepare(
			`SELECT post_category, post_slug, COUNT(*) AS count, SUM(amount) AS total
			FROM tips WHERE status = 'approved' GROUP BY post_category, post_slug
			ORDER BY total DESC, count DESC LIMIT 50`
		),
		db.prepare(
			"SELECT status, COUNT(*) AS count FROM tips WHERE status != 'approved' GROUP BY status"
		),
		db.prepare(
			`SELECT destination, COUNT(*) AS count, SUM(amount) AS total
			FROM tips WHERE status = 'approved' GROUP BY destination`
		)
	]);
	const t = /** @type {any} */ (totals.results[0] ?? {});
	/** @type {Record<string, number>} */
	const counts = { pending: 0, rejected: 0, refunded: 0 };
	for (const r of /** @type {any[]} */ (others.results)) counts[String(r.status)] = Number(r.count);
	/** @type {Record<TipDestination, { count: number, total: number }>} */
	const destinations = { kinkyvibe: { count: 0, total: 0 }, fondo: { count: 0, total: 0 } };
	for (const r of /** @type {any[]} */ (byDestination.results)) {
		const d = /** @type {TipDestination} */ (String(r.destination));
		if (d in destinations) destinations[d] = { count: Number(r.count), total: Number(r.total) };
	}
	return {
		count: Number(t.count ?? 0),
		total: Number(t.total ?? 0),
		byDestination: destinations,
		byMonth: /** @type {any[]} */ (byMonth.results).map((r) => ({
			month: String(r.month),
			count: Number(r.count),
			total: Number(r.total)
		})),
		byPost: /** @type {any[]} */ (byPost.results).map((r) => ({
			category: String(r.post_category),
			slug: String(r.post_slug),
			count: Number(r.count),
			total: Number(r.total)
		})),
		counts
	};
}

/**
 * Propinas de la más nueva a la más vieja. `includePending: false` deja afuera las que nunca se
 * pagaron (la lista de la página); el CSV las incluye. `destination`: solo las de ese destino
 * (el filtro del panel); sin él, todas.
 *
 * @param {D1Database} db
 * @param {{ limit?: number, includePending?: boolean, destination?: TipDestination | null }} [opts]
 * @returns {Promise<Tip[]>}
 */
export async function listTips(
	db,
	{ limit = 200, includePending = false, destination = null } = {}
) {
	const where = [];
	if (!includePending) where.push("status != 'pending'");
	if (destination) where.push('destination = ?2');
	const stmt = db.prepare(
		`SELECT * FROM tips ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
		ORDER BY created_at DESC LIMIT ?1`
	);
	const { results } = await (destination ? stmt.bind(limit, destination) : stmt.bind(limit)).all();
	return /** @type {Tip[]} */ (/** @type {unknown} */ (results));
}

/** Columnas del CSV de propinas. @type {import('$lib/admin/csv.js').CsvColumn<Tip>[]} */
export const TIP_CSV_COLUMNS = [
	{ label: 'id', key: 'id' },
	{ label: 'fecha', value: (t) => new Date(t.created_at).toISOString() },
	{ label: 'aprobada', value: (t) => (t.approved_at ? new Date(t.approved_at).toISOString() : '') },
	{ label: 'estado', value: (t) => TIP_STATUS_LABELS[t.status] ?? t.status },
	{ label: 'monto', key: 'amount' },
	{ label: 'categoria', key: 'post_category' },
	{ label: 'publicacion', key: 'post_slug' },
	{ label: 'mensaje', value: (t) => t.message ?? '' },
	{ label: 'pago_mp', value: (t) => t.mp_payment_id ?? '' },
	{ label: 'destino', value: (t) => TIP_DESTINATION_LABELS[t.destination] ?? t.destination }
];

/** Re-chequeos con MP desde la página de gracias, por propina (si el webhook tarda). */
export const TIP_RECHECK_LIMIT = { limit: 10, windowSeconds: 10 * 60 };

/**
 * Si la propina sigue pendiente (el webhook todavía no llegó), le pregunta a MP por su pago y lo
 * aplica. El pago sale de la API de MP (por `external_reference`), nunca de la URL de vuelta.
 *
 * @param {{
 *   db: D1Database,
 *   gateway: import('$lib/server/tickets/index.js').Gateway | null,
 *   tip: Tip,
 *   now?: number
 * }} input
 * @returns {Promise<Tip>}
 */
export async function recheckTip({ db, gateway, tip, now = Date.now() }) {
	if (tip.status !== 'pending' || !gateway) return tip;
	try {
		const limit = await hitRateLimit(db, `propinas:g:${tip.id}`, TIP_RECHECK_LIMIT, now);
		if (!limit.allowed) return tip;
		const payment = await gateway.findPaymentByOrder(tipReference(tip.id));
		if (!payment) return tip;
		const res = await applyTipPayment(db, payment, { now });
		return res.tip ?? tip;
	} catch (error) {
		console.error(`[propinas] no se pudo re-chequear la propina ${tip.id}:`, error);
		return tip;
	}
}

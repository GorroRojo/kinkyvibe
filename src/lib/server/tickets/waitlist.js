/**
 * Lista de espera de las entradas (tabla `waitlist_entries`, migración 0053; docs/tickets.md,
 * «Lista de espera»). Detrás del interruptor `lista_espera`.
 *
 * Acá están solo los cambios de estado de una anotación, cada uno en una sentencia que mira el
 * estado de antes (dos pedidos a la vez no pisan nada):
 *
 * - anotarse (`joinWaitlist`): queda `pending_confirmation` con un token para el mail de
 *   confirmar; con una cuenta cuyo mail ya está verificado, entra directo a `waiting`;
 * - confirmar (`confirmWaitlistEntry`): `pending_confirmation` → `waiting`;
 * - volver a anotarse después de que venció su reserva (`rejoinWaitlist`): una anotación nueva,
 *   al final de la fila y sin confirmar otra vez;
 * - salir (`leaveWaitlist`) o que le saque une admin (`removeFromWaitlist`): `cancelled`;
 * - terminar una oferta o cerrar (`endWaitlistEntry`): `expired`;
 * - compró con su oferta (`markPurchasedStatement`): `offered` → `purchased`;
 * - borrar las anotaciones sin confirmar de más de 48 h (`deleteExpiredUnconfirmed`).
 *
 * Una anotación sin confirmar nunca pasa a `cancelled` ni a `expired`: se borra (nunca dio su
 * consentimiento, como en «Avisame si se repite»).
 *
 * Todavía no: el motor que ofrece los lugares, los mails, la compra con la oferta ni el panel
 * (las partes siguientes del plan).
 */
import { sha256Hex } from '$lib/server/hash.js';
import { normalizeEmail } from '$lib/server/cuentas/accounts.js';
import { randomToken } from '$lib/server/cuentas/crypto.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */

/** Cuánto vale el link de confirmar (y cuándo se borra una anotación sin confirmar). */
export const WAITLIST_CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;

/** Los estados de una anotación viva (la que cuenta para «una por mail y alcance»). */
export const LIVE_STATUSES = /** @type {const} */ (['pending_confirmation', 'waiting', 'offered']);

/** Por qué terminó una anotación que pasa a `expired`. */
export const EXPIRE_REASONS = /** @type {const} */ ([
	'hold_expired',
	'admin',
	'closed',
	'event_cancelled',
	'type_removed'
]);

/** @typedef {(typeof EXPIRE_REASONS)[number]} ExpireReason */

const LIVE_SQL = "('pending_confirmation','waiting','offered')";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/**
 * El tipo de entrada de un alcance: `null` = todo el evento.
 * @param {string | null | undefined} ticketType
 */
const scopeType = (ticketType) =>
	typeof ticketType === 'string' && ticketType.trim() ? ticketType.trim() : null;

/** @param {unknown} error */
const isUniqueError = (error) => /UNIQUE constraint failed/i.test(String(error));

/**
 * ¿La cuenta existe, está viva y su mail (ya verificado) es este?
 *
 * @param {D1Database} db
 * @param {string | null | undefined} accountId
 * @param {string} email normalizado
 */
async function accountVerified(db, accountId, email) {
	if (!accountId) return false;
	const row = await db
		.prepare(
			`SELECT 1 AS ok FROM accounts WHERE id = ?1 AND email = ?2
			AND email_verified_at IS NOT NULL AND deleted_at IS NULL`
		)
		.bind(accountId, email)
		.first();
	return Boolean(row);
}

/**
 * La anotación viva de un mail en un alcance, si hay.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string | null} ticketType
 * @param {string} email
 */
async function liveEntry(db, eventSlug, ticketType, email) {
	return db
		.prepare(
			`SELECT id, status FROM waitlist_entries
			WHERE event_slug = ?1 AND COALESCE(ticket_type, '') = ?2 AND email = ?3
			AND status IN ${LIVE_SQL}`
		)
		.bind(eventSlug, ticketType ?? '', email)
		.first();
}

/**
 * @typedef {{ ok: false, reason: 'bad_email' }
 *   | { ok: true, status: 'pending', id: string, token: string }
 *   | { ok: true, status: 'waiting', id: string }
 *   | { ok: true, status: 'already', id: string }} JoinResult
 * - `pending`: hay que mandarle el mail de confirmar con `token` (vale 48 h). Si ya estaba sin
 *   confirmar, es un token nuevo (el viejo deja de valer).
 * - `waiting`: entró directo a la fila (cuenta con el mail verificado).
 * - `already`: ya estaba en la fila (o con un lugar ofrecido). No se cambia nada; quien llama
 *   responde lo mismo que en los otros casos (no se revela quién está anotade).
 */

/**
 * Anota un mail en la lista de un evento (`ticketType` vacío) o de un tipo de entrada.
 *
 * No mira el interruptor, los límites ni si el evento está agotado: eso lo hace quien llama.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, ticketType?: string | null, email: unknown,
 *   accountId?: string | null, clientHash?: string | null, now?: number }} input
 *   `accountId`: la cuenta con sesión abierta; si su mail verificado es `email`, no hace falta
 *   confirmar.
 * @returns {Promise<JoinResult>}
 */
export async function joinWaitlist(db, input) {
	return join(db, input, true);
}

/**
 * @param {D1Database} db
 * @param {Parameters<typeof joinWaitlist>[1]} input
 * @param {boolean} retry
 * @returns {Promise<JoinResult>}
 */
async function join(db, input, retry) {
	const { eventSlug, accountId = null, clientHash = null, now = Date.now() } = input;
	const email = normalizeEmail(input.email);
	if (!email) return { ok: false, reason: 'bad_email' };
	const ticketType = scopeType(input.ticketType);
	const verified = await accountVerified(db, accountId, email);
	const existing = await liveEntry(db, eventSlug, ticketType, email);
	if (existing) {
		const id = String(existing.id);
		if (existing.status !== 'pending_confirmation') return { ok: true, status: 'already', id };
		if (verified) {
			const row = await confirmByIdStatement(db, id, now).first();
			// Si justo dejó de estar sin confirmar (confirmó por mail, se borró), se vuelve a mirar.
			if (row) return { ok: true, status: 'waiting', id };
			return retry ? join(db, input, false) : { ok: true, status: 'already', id };
		}
		const token = randomToken();
		const changed = await db
			.prepare(
				`UPDATE waitlist_entries SET confirm_hash = ?2, confirm_expires_at = ?3, updated_at = ?4
				WHERE id = ?1 AND status = 'pending_confirmation'`
			)
			.bind(id, await sha256Hex(token), now + WAITLIST_CONFIRM_TTL_MS, now)
			.run();
		if (Number(changed.meta?.changes ?? 0) === 1) return { ok: true, status: 'pending', id, token };
		return retry ? join(db, input, false) : { ok: true, status: 'already', id };
	}
	const id = crypto.randomUUID();
	const token = verified ? null : randomToken();
	try {
		await db
			.prepare(
				`INSERT INTO waitlist_entries (id, event_slug, ticket_type, email, status, confirm_hash,
					confirm_expires_at, confirmed_at, client_hash, created_at, updated_at)
				VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`
			)
			.bind(
				id,
				eventSlug,
				ticketType,
				email,
				verified ? 'waiting' : 'pending_confirmation',
				token ? await sha256Hex(token) : null,
				token ? now + WAITLIST_CONFIRM_TTL_MS : null,
				verified ? now : null,
				clientHash,
				now
			)
			.run();
	} catch (error) {
		// Otro pedido con el mismo mail y alcance ganó de mano: se mira lo que quedó.
		if (retry && isUniqueError(error)) return join(db, input, false);
		throw error;
	}
	return token ? { ok: true, status: 'pending', id, token } : { ok: true, status: 'waiting', id };
}

/**
 * `pending_confirmation` → `waiting` por id (con cuenta verificada, sin token).
 * @param {D1Database} db
 * @param {string} id
 * @param {number} now
 */
function confirmByIdStatement(db, id, now) {
	return db
		.prepare(
			`UPDATE waitlist_entries
			SET status = 'waiting', confirmed_at = ?2, confirm_hash = NULL, confirm_expires_at = NULL,
				updated_at = ?2
			WHERE id = ?1 AND status = 'pending_confirmation'
			RETURNING id`
		)
		.bind(id, now);
}

/**
 * @typedef {{ id: string, eventSlug: string, ticketType: string | null }} EntryRef
 */

/** @param {Record<string, unknown>} row @returns {EntryRef} */
const refOf = (row) => ({
	id: String(row.id),
	eventSlug: String(row.event_slug),
	ticketType: row.ticket_type == null ? null : String(row.ticket_type)
});

/**
 * Confirma con el token del link del mail: entra a la fila (el orden es la hora de confirmar).
 * `null` si el link no vale (venció, ya se usó o nunca existió).
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @param {number} [now]
 * @returns {Promise<EntryRef | null>}
 */
export async function confirmWaitlistEntry(db, token, now = Date.now()) {
	if (typeof token !== 'string' || !TOKEN_RE.test(token)) return null;
	const row = await db
		.prepare(
			`UPDATE waitlist_entries
			SET status = 'waiting', confirmed_at = ?2, confirm_hash = NULL, confirm_expires_at = NULL,
				updated_at = ?2
			WHERE confirm_hash = ?1 AND status = 'pending_confirmation' AND confirm_expires_at > ?2
			RETURNING id, event_slug, ticket_type`
		)
		.bind(await sha256Hex(token), now)
		.first();
	return row ? refOf(row) : null;
}

/**
 * Vuelve a anotar, al final de la fila y sin confirmar otra vez, a quien se le venció la reserva
 * (el botón «Volver a anotarme» del mail). Solo desde una anotación `expired` por
 * `hold_expired`. `already` si ya tiene otra anotación viva en ese alcance; `null` si no se puede.
 *
 * @param {D1Database} db
 * @param {string} entryId la anotación que venció
 * @param {number} [now]
 * @returns {Promise<{ status: 'waiting' | 'already', id: string } | null>}
 */
export async function rejoinWaitlist(db, entryId, now = Date.now()) {
	const old = await db
		.prepare(
			`SELECT event_slug, ticket_type, email, client_hash FROM waitlist_entries
			WHERE id = ?1 AND status = 'expired' AND end_reason = 'hold_expired'`
		)
		.bind(entryId)
		.first();
	if (!old) return null;
	const id = crypto.randomUUID();
	try {
		const row = await db
			.prepare(
				`INSERT INTO waitlist_entries (id, event_slug, ticket_type, email, status, confirmed_at,
					client_hash, created_at, updated_at)
				SELECT ?1, event_slug, ticket_type, email, 'waiting', ?3, client_hash, ?3, ?3
				FROM waitlist_entries o WHERE o.id = ?2 AND o.status = 'expired'
					AND o.end_reason = 'hold_expired'
					AND NOT EXISTS (SELECT 1 FROM waitlist_entries w
						WHERE w.event_slug = o.event_slug
						AND COALESCE(w.ticket_type, '') = COALESCE(o.ticket_type, '')
						AND w.email = o.email AND w.status IN ${LIVE_SQL})
				RETURNING id`
			)
			.bind(id, entryId, now)
			.first();
		if (row) return { status: 'waiting', id };
	} catch (error) {
		if (!isUniqueError(error)) throw error;
	}
	const live = await liveEntry(
		db,
		String(old.event_slug),
		old.ticket_type == null ? null : String(old.ticket_type),
		String(old.email)
	);
	return live ? { status: 'already', id: String(live.id) } : null;
}

/**
 * @typedef {EntryRef & { was: 'pending_confirmation' | 'waiting' | 'offered' }} EndedEntry
 * `was`: el estado de antes. Si era `offered`, se liberó un lugar guardado (el motor tiene que
 * pasar a la siguiente persona).
 */

/**
 * Saca una anotación viva de la fila: `cancelled` (o borrada si estaba sin confirmar).
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {{ reason: 'left' | 'admin', by: string | null, now: number }} opts
 * @returns {Promise<EndedEntry | null>} `null` si no estaba viva
 */
async function cancelEntry(db, id, { reason, by, now }) {
	for (let attempt = 0; attempt < 2; attempt++) {
		const cur = await db
			.prepare(
				`SELECT id, event_slug, ticket_type, status FROM waitlist_entries
				WHERE id = ?1 AND status IN ${LIVE_SQL}`
			)
			.bind(id)
			.first();
		if (!cur) return null;
		const was = /** @type {EndedEntry['was']} */ (String(cur.status));
		const result =
			was === 'pending_confirmation'
				? await db
						.prepare(
							"DELETE FROM waitlist_entries WHERE id = ?1 AND status = 'pending_confirmation'"
						)
						.bind(id)
						.run()
				: await db
						.prepare(
							`UPDATE waitlist_entries
							SET status = 'cancelled', end_reason = ?3, ended_by = ?4, ended_at = ?5,
								updated_at = ?5, offer_token_hash = NULL
							WHERE id = ?1 AND status = ?2`
						)
						.bind(id, was, reason, by, now)
						.run();
		// Si cambió de estado entre la lectura y el cambio (justo le ofrecieron un lugar), otra vez.
		if (Number(result.meta?.changes ?? 0) === 1) return { ...refOf(cur), was };
	}
	return null;
}

/**
 * La persona sale de la lista (link «Salir de la lista» de los mails, ya verificado).
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {{ now?: number }} [opts]
 */
export function leaveWaitlist(db, id, { now = Date.now() } = {}) {
	return cancelEntry(db, id, { reason: 'left', by: null, now });
}

/**
 * Une admin saca a alguien de la lista desde el panel («Sacar de la lista»).
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {{ by: string, now?: number }} opts
 */
export function removeFromWaitlist(db, id, { by, now = Date.now() }) {
	return cancelEntry(db, id, { reason: 'admin', by, now });
}

/**
 * Termina una anotación confirmada: `expired`, con su motivo.
 *
 * - `hold_expired`: venció su reserva (solo `offered` con `hold_until <= now`).
 * - `admin`: une admin terminó su reserva para pasar a la siguiente (solo `offered`).
 * - `closed`, `event_cancelled`, `type_removed`: cerró la lista (desde `waiting` u `offered`).
 *
 * @param {D1Database} db
 * @param {string} id
 * @param {{ reason: ExpireReason, by?: string | null, now?: number }} opts
 * @returns {Promise<EntryRef & { was: 'waiting' | 'offered' } | null>} `null` si no se podía
 */
export async function endWaitlistEntry(db, id, { reason, by = null, now = Date.now() }) {
	if (!EXPIRE_REASONS.includes(reason)) throw new RangeError(`Motivo desconocido: ${reason}`);
	const from =
		reason === 'hold_expired'
			? "status = 'offered' AND hold_until IS NOT NULL AND hold_until <= ?4"
			: reason === 'admin'
				? "status = 'offered'"
				: "status IN ('waiting','offered')";
	// `was`: `offered_at` solo existe en una anotación a la que se le ofreció un lugar, y una que
	// está `waiting` nunca tuvo oferta (al vencer, sale de la fila).
	const row = await db
		.prepare(
			`UPDATE waitlist_entries
			SET status = 'expired', end_reason = ?2, ended_by = ?3, ended_at = ?4, updated_at = ?4,
				offer_token_hash = NULL
			WHERE id = ?1 AND ${from}
			RETURNING id, event_slug, ticket_type, offered_at`
		)
		.bind(id, reason, by, now)
		.first();
	if (!row) return null;
	return { ...refOf(row), was: row.offered_at == null ? 'waiting' : 'offered' };
}

/**
 * La sentencia que marca que alguien compró con su oferta (`offered` → `purchased`), para correr
 * en la misma tanda que crea la orden (`reserveOrder`). No cambia nada si la oferta ya no vale
 * (venció, la usó otra compra, terminó), si la orden no existe o si es de otro evento o de otro
 * tipo que el de la lista.
 *
 * @param {D1Database} db
 * @param {{ entryId: string, orderId: string, now: number }} input
 * @returns {D1PreparedStatement}
 */
export function markPurchasedStatement(db, { entryId, orderId, now }) {
	return db
		.prepare(
			`UPDATE waitlist_entries SET status = 'purchased', order_id = ?2, updated_at = ?3
			WHERE id = ?1 AND status = 'offered' AND (hold_until IS NULL OR hold_until > ?3)
			AND EXISTS (SELECT 1 FROM orders o WHERE o.id = ?2
				AND o.event_slug = waitlist_entries.event_slug
				AND (waitlist_entries.ticket_type IS NULL
					OR o.ticket_type = waitlist_entries.ticket_type))`
		)
		.bind(entryId, orderId, now);
}

/**
 * Marca que alguien compró con su oferta (ver {@link markPurchasedStatement}). `true` si cambió.
 *
 * @param {D1Database} db
 * @param {{ entryId: string, orderId: string, now?: number }} input
 */
export async function markPurchased(db, { entryId, orderId, now = Date.now() }) {
	const r = await markPurchasedStatement(db, { entryId, orderId, now }).run();
	return Number(r.meta?.changes ?? 0) === 1;
}

/**
 * Borra las anotaciones sin confirmar cuyo link venció (48 h): nunca dieron su consentimiento.
 * Devuelve cuántas borró.
 *
 * @param {D1Database} db
 * @param {number} [now]
 */
export async function deleteExpiredUnconfirmed(db, now = Date.now()) {
	const r = await db
		.prepare(
			`DELETE FROM waitlist_entries
			WHERE status = 'pending_confirmation' AND confirm_expires_at <= ?1`
		)
		.bind(now)
		.run();
	return Number(r.meta?.changes ?? 0);
}

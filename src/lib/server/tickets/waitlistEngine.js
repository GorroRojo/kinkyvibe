/**
 * El motor de la lista de espera (docs/tickets.md, «Lista de espera»): pasa los lugares que se
 * liberan a la próxima persona, vence las reservas, cierra la lista y manda sus mails. Detrás del
 * interruptor `lista_espera`.
 *
 * - {@link advanceWaitlist}: una pasada sobre un evento. Idempotente: se puede correr cuantas
 *   veces se quiera, y dos a la vez nunca ofrecen el mismo lugar dos veces.
 * - {@link runWaitlistCron}: la pasada sobre cada evento con anotaciones vivas, desde el cron de
 *   siempre (`POST /api/cron/recordatorios`, cada 15 minutos; no hay un cron nuevo).
 * - {@link sendWaitlistMails}: los mails de la oferta, el último aviso, la reserva vencida (o
 *   terminada por admin, si lo pidió: {@link queueEndedMail}) y el cierre. No hay una cola aparte: lo que falta mandar sale del estado de cada anotación y de
 *   `waitlist_sends` (una fila por anotación, mail y ronda: nunca sale dos veces). En el cron van
 *   primero en la tanda (`runMailQueueWith`): son pocos y urgentes.
 * - {@link queueWaitlistAdvance}: el «empujón» desde donde se libera un lugar (reembolso,
 *   cancelación, alguien que sale de la fila…), en segundo plano (`waitUntil`) y como mucho uno
 *   por minuto y evento. Es solo para que la oferta salga antes: lo que garantiza que salga es el
 *   cron.
 *
 * El link de la oferta (`?lista=<token>`) lleva un token de 256 bits que no se guarda: es la firma
 * HMAC de `offer:<id>:<ronda>` con una clave propia ({@link WAITLIST_OFFER_KEY}), y en la base
 * queda solo su SHA-256 (`offer_token_hash`). Así el mail de la oferta, sus reintentos y el último
 * aviso llevan siempre el mismo link, y una compra abandonada recupera el mismo.
 *
 * Los logs nunca llevan el mail: solo ids y cuentas.
 */
import { getDB } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { isFlagOn } from '$lib/server/flags.js';
import { sha256Hex } from '$lib/server/hash.js';
import { signLink } from '$lib/server/signedLinks.js';
import {
	WAITLIST_SETTINGS,
	effectiveWaitlistSettings,
	holdUntil
} from '$lib/utils/waitlistHold.js';
import { mailBatchSize } from './batchSize.js';
import { salesState, typeAvailability, typeClosesAt } from './config.js';
import { HOLDING } from './discounts.js';
import { getEventTickets } from './events.js';
import { contactEmail } from './index.js';
import { getTaken } from './orders.js';
import { expireStaleClaims, sendBatch, STALE_CLAIM_MS } from './sendState.js';
import { getSalesSettings } from './settings.js';
import { resolveTemplate } from './templates.js';
import {
	buildWaitlistClosedEmail,
	buildWaitlistEndedEmail,
	buildWaitlistExpiredEmail,
	buildWaitlistOfferEmail,
	buildWaitlistReminderEmail
} from './waitlistEmail.js';
import {
	waitlistIdempotencyKey,
	waitlistLeaveUrl,
	waitlistOfferUrl,
	waitlistRejoinUrl,
	waitlistSender
} from './waitlistMail.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('@cloudflare/workers-types').D1PreparedStatement} D1PreparedStatement */
/** @typedef {import('./config.js').EventTickets} EventTickets */
/** @typedef {import('./waitlistMail.js').WaitlistSend} WaitlistSend */
/** @typedef {import('./waitlistMail.js').WaitlistSendKind} WaitlistSendKind */
/** @typedef {(slug: string) => Promise<EventTickets | null>} ConfigOf */

/** Clave de `ticket_settings` que firma los tokens de las ofertas (se crea sola). */
export const WAITLIST_OFFER_KEY = 'waitlist_offer_key';

const HOUR_MS = 60 * 60 * 1000;

/** El último aviso: solo en reservas de 12 h o más, cuando quedan 3 h (respuesta 5 de gorrite). */
export const REMINDER_MIN_HOLD_MS = 12 * HOUR_MS;
export const REMINDER_BEFORE_MS = 3 * HOUR_MS;

/** Los mails de «se venció» y «se cerró» se mandan solo si pasó hace menos de esto. */
export const ENDED_MAIL_WINDOW_MS = 48 * HOUR_MS;

/** El empujón: como mucho uno por evento en esta ventana (`hitRateLimit`). */
export const NUDGE_RULE = Object.freeze({ limit: 1, windowSeconds: 60 });

/** De a cuántas sentencias va el aviso a toda la lista (`db.batch`). */
const BATCH_CHUNK = 50;

/** El alcance de una anotación en SQL ('' = todo el evento). */
const SCOPE_SQL = "COALESCE(ticket_type, '')";

/**
 * El token de la oferta de una anotación en una ronda (43 caracteres, base64url de 256 bits).
 *
 * @param {D1Database} db
 * @param {string} entryId
 * @param {number} round `offer_count` de esa oferta
 */
export function offerToken(db, entryId, round) {
	return signLink(db, WAITLIST_OFFER_KEY, `offer:${entryId}:${round}`, 43);
}

/** @param {{ meta?: { changes?: number } }} r */
const changes = (r) => Number(r.meta?.changes ?? 0);

/**
 * @typedef {{
 *   expired: number, restored: number, offered: number, closed: number, removed: number,
 *   deleted: number, skipped?: 'no-config' | 'no-list'
 * }} AdvanceResult
 * - `expired`: reservas vencidas (`hold_expired`);
 * - `restored`: compras abandonadas que volvieron a `offered` (hasta su vencimiento original);
 * - `offered`: ofertas nuevas (una persona, o toda la fila en el aviso a todes);
 * - `closed`: anotaciones que se cerraron (cierre de la lista o evento cancelado);
 * - `removed`: anotaciones de un alcance que ya no existe (`type_removed`);
 * - `deleted`: anotaciones sin confirmar de más de 48 h, borradas;
 * - `skipped`: el evento ya no vende entradas o no tiene lista: no se ofrece ni se cierra nada.
 */

/**
 * Una pasada de la lista de un evento:
 *
 * 1. vence las reservas cuya hora pasó (`offered` → `expired`, `hold_expired`; el mail «se venció»
 *    sale por {@link sendWaitlistMails});
 * 2. devuelve a `offered` a quien compró con su oferta y no pagó (la orden se canceló, venció o
 *    fue rechazada), hasta el vencimiento original y sin tiempo extra (respuesta 7);
 * 3. mira lo libre de cada alcance (`getTaken` + `typeAvailability`); no ofrece nada si la venta
 *    no está abierta (`agotadas` a mano, todavía no abrió);
 * 4. si hay lugar y nadie tiene uno guardado vigente, se lo ofrece a la primera persona de la
 *    fila con una sola sentencia atómica (en el aviso a todes, a toda la fila);
 * 5. pasado el cierre de la lista (comienzo − 30 min o el cierre de la venta), o con el evento
 *    cancelado, cierra: `waiting`/`offered` → `expired` (`closed` / `event_cancelled`). Eso
 *    incluye a quien confirmó después del cierre;
 * 6. borra las anotaciones sin confirmar cuyo link venció (48 h).
 *
 * Si el evento ya no vende entradas, o no tiene lista (`config` null o sin `waitlist`), solo
 * hace 1, 2 y 6: nunca cierra una lista por una configuración que no se pudo leer.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, now?: number, config?: EventTickets | null,
 *   configOf?: ConfigOf }} input `config`: la del evento ya leída; si no, `configOf`
 *   (por defecto `getEventTickets`)
 * @returns {Promise<AdvanceResult>}
 */
export async function advanceWaitlist(db, input) {
	const { eventSlug, now = Date.now(), configOf = getEventTickets } = input;
	/** @type {AdvanceResult} */
	const out = { expired: 0, restored: 0, offered: 0, closed: 0, removed: 0, deleted: 0 };

	// 1. Reservas vencidas.
	out.expired = changes(
		await db
			.prepare(
				`UPDATE waitlist_entries
				SET status = 'expired', end_reason = 'hold_expired', ended_at = ?2, updated_at = ?2,
					offer_token_hash = NULL
				WHERE event_slug = ?1 AND status = 'offered' AND hold_until IS NOT NULL
					AND hold_until <= ?2`
			)
			.bind(eventSlug, now)
			.run()
	);

	// 2. Compras con la oferta que no se pagaron: vuelve la misma oferta (mismo link y ronda).
	out.restored = changes(
		await db
			.prepare(
				`UPDATE waitlist_entries SET status = 'offered', order_id = NULL, updated_at = ?2
				WHERE event_slug = ?1 AND status = 'purchased' AND offer_token_hash IS NOT NULL
					AND (hold_until IS NULL OR hold_until > ?2)
					AND EXISTS (SELECT 1 FROM orders o WHERE o.id = waitlist_entries.order_id
						AND (o.status IN ('cancelled', 'expired', 'rejected')
							OR (o.status IN ${HOLDING} AND o.expires_at <= ?2)))`
			)
			.bind(eventSlug, now)
			.run()
	);

	// 6. (Primero, no depende de la configuración.) Sin confirmar de más de 48 h.
	out.deleted = changes(
		await db
			.prepare(
				`DELETE FROM waitlist_entries
				WHERE event_slug = ?1 AND status = 'pending_confirmation' AND confirm_expires_at <= ?2`
			)
			.bind(eventSlug, now)
			.run()
	);

	const config = input.config !== undefined ? input.config : await configOf(eventSlug);
	if (!config) return { ...out, skipped: 'no-config' };
	const list = config.waitlist;
	if (!list) return { ...out, skipped: 'no-list' };

	// 5. Evento cancelado: se cierra todo.
	if (config.status === 'cancelado') {
		out.closed = await closeScope(db, eventSlug, null, 'event_cancelled', now);
		return out;
	}

	const settings = effectiveWaitlistSettings(WAITLIST_SETTINGS, list);
	const sales = salesState(config, now);
	const scopes =
		list.scope === 'event'
			? [{ key: '', types: config.types, salesClose: config.closesAt }]
			: config.types
					.filter((t) => t.capacity !== null && t.capacity !== undefined)
					.map((t) => ({ key: t.id, types: [t], salesClose: typeClosesAt(config, t) }));

	// Anotaciones de un alcance que ya no existe (se cambió el alcance o se borró el tipo a mano;
	// el editor no lo deja hacer con anotaciones vivas).
	out.removed = await removeOrphans(
		db,
		eventSlug,
		scopes.map((s) => s.key),
		now
	);

	/** @type {import('$lib/utils/ticketTiers.js').TakenCounts | null} */
	let taken = null;
	for (const scope of scopes) {
		const hold = holdUntil({
			now,
			start: config.start ?? null,
			salesClose: scope.salesClose,
			settings
		});
		// 5. Pasó el cierre de la lista (o cerró la venta de todo el evento).
		if (
			hold.kind === 'closed' ||
			(list.scope === 'event' && !sales.open && sales.reason === 'closed')
		) {
			out.closed += await closeScope(db, eventSlug, scope.key, 'closed', now);
			continue;
		}
		// 3. Venta no abierta (agotadas a mano, todavía no abrió): la fila espera.
		if (!sales.open) continue;
		taken ??= await getTaken(db, eventSlug, now);
		let free = 0;
		for (const t of scope.types) {
			const a = typeAvailability(config, t, taken, now);
			if (a.state !== 'open') continue;
			free += a.remaining === null ? Infinity : a.remaining;
		}
		if (free <= 0) continue;
		// 4. La oferta.
		out.offered +=
			hold.kind === 'broadcast'
				? await offerAll(db, eventSlug, scope.key, now)
				: await offerNext(db, eventSlug, scope.key, hold.until, now);
	}
	return out;
}

/**
 * «Nadie del alcance tiene un lugar guardado vigente» (para el `WHERE` de una oferta).
 * Parámetros: ?1 = evento, ?2 = alcance, ?3 = now.
 */
const NO_ACTIVE_HOLD = `NOT EXISTS (SELECT 1 FROM waitlist_entries w
	WHERE w.event_slug = ?1 AND COALESCE(w.ticket_type, '') = ?2 AND w.status = 'offered'
	AND w.hold_until > ?3)`;

/**
 * La sentencia que le ofrece un lugar a una anotación `waiting` (ronda `round`). No cambia nada
 * si ya no está esperando, si otra corrida ya le ofreció (la ronda cambió) o si alguien del
 * alcance tiene un lugar guardado vigente. Con `first`, además tiene que seguir siendo la primera
 * de la fila.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, scope: string, id: string, round: number, tokenHash: string,
 *   holdUntil: number | null, now: number, first: boolean }} o
 */
function offerStatement(db, { eventSlug, scope, id, round, tokenHash, holdUntil, now, first }) {
	const head = first
		? `AND id = (SELECT id FROM waitlist_entries WHERE event_slug = ?1
				AND ${SCOPE_SQL} = ?2 AND status = 'waiting' ORDER BY confirmed_at, id LIMIT 1)`
		: '';
	return db
		.prepare(
			`UPDATE waitlist_entries
			SET status = 'offered', offer_count = ?5, offered_at = ?3, hold_until = ?6,
				offer_token_hash = ?7, updated_at = ?3
			WHERE id = ?4 AND event_slug = ?1 AND ${SCOPE_SQL} = ?2 AND status = 'waiting'
				AND offer_count = ?5 - 1 ${head}
				AND ${NO_ACTIVE_HOLD}`
		)
		.bind(eventSlug, scope, now, id, round, holdUntil, tokenHash);
}

/**
 * De a una persona: le guarda el lugar hasta `until` a la primera de la fila. Devuelve 1 si
 * ofreció, 0 si no (fila vacía, alguien con un lugar guardado vigente u otra corrida ganó).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} scope
 * @param {number} until
 * @param {number} now
 */
async function offerNext(db, eventSlug, scope, until, now) {
	const head = await db
		.prepare(
			`SELECT id, offer_count FROM waitlist_entries
			WHERE event_slug = ?1 AND ${SCOPE_SQL} = ?2 AND status = 'waiting'
			ORDER BY confirmed_at, id LIMIT 1`
		)
		.bind(eventSlug, scope)
		.first();
	if (!head) return 0;
	const id = String(head.id);
	const round = Number(head.offer_count) + 1;
	const tokenHash = await sha256Hex(await offerToken(db, id, round));
	const r = await offerStatement(db, {
		eventSlug,
		scope,
		id,
		round,
		tokenHash,
		holdUntil: until,
		now,
		first: true
	}).run();
	return changes(r);
}

/**
 * El aviso a toda la fila a la vez (`hold_until` NULL: se lo queda quien compre primero).
 * Devuelve a cuántas personas se les ofreció.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} scope
 * @param {number} now
 */
async function offerAll(db, eventSlug, scope, now) {
	const { results } = await db
		.prepare(
			`SELECT id, offer_count FROM waitlist_entries
			WHERE event_slug = ?1 AND ${SCOPE_SQL} = ?2 AND status = 'waiting'
			ORDER BY confirmed_at, id`
		)
		.bind(eventSlug, scope)
		.all();
	let offered = 0;
	for (let i = 0; i < results.length; i += BATCH_CHUNK) {
		const statements = await Promise.all(
			results.slice(i, i + BATCH_CHUNK).map(async (row) => {
				const id = String(row.id);
				const round = Number(row.offer_count) + 1;
				return offerStatement(db, {
					eventSlug,
					scope,
					id,
					round,
					tokenHash: await sha256Hex(await offerToken(db, id, round)),
					holdUntil: null,
					now,
					first: false
				});
			})
		);
		for (const r of await db.batch(statements)) offered += changes(r);
	}
	return offered;
}

/**
 * Cierra la lista de un alcance (`null` = todos los del evento): `waiting`/`offered` → `expired`.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string | null} scope
 * @param {'closed' | 'event_cancelled'} reason
 * @param {number} now
 */
async function closeScope(db, eventSlug, scope, reason, now) {
	const r = await db
		.prepare(
			`UPDATE waitlist_entries
			SET status = 'expired', end_reason = ?3, ended_at = ?4, updated_at = ?4,
				offer_token_hash = NULL
			WHERE event_slug = ?1 AND status IN ('waiting', 'offered')
				AND (?2 IS NULL OR ${SCOPE_SQL} = ?2)`
		)
		.bind(eventSlug, scope, reason, now)
		.run();
	return changes(r);
}

/**
 * Las anotaciones confirmadas de un alcance que ya no está en la lista → `expired`
 * (`type_removed`).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string[]} scopes los alcances que existen
 * @param {number} now
 */
async function removeOrphans(db, eventSlug, scopes, now) {
	const r = await db
		.prepare(
			`UPDATE waitlist_entries
			SET status = 'expired', end_reason = 'type_removed', ended_at = ?3, updated_at = ?3,
				offer_token_hash = NULL
			WHERE event_slug = ?1 AND status IN ('waiting', 'offered')
				AND ${SCOPE_SQL} NOT IN (SELECT value FROM json_each(?2))`
		)
		.bind(eventSlug, JSON.stringify(scopes), now)
		.run();
	return changes(r);
}

/**
 * Los eventos que el cron tiene que mirar: con anotaciones vivas, o con una compra hecha con la
 * oferta que se abandonó (paso 2).
 *
 * @param {D1Database} db
 * @param {number} now
 * @returns {Promise<string[]>}
 */
export async function waitlistEventsToSweep(db, now) {
	const { results } = await db
		.prepare(
			`SELECT DISTINCT event_slug FROM waitlist_entries
			WHERE status IN ('pending_confirmation', 'waiting', 'offered')
				OR (status = 'purchased' AND (hold_until IS NULL OR hold_until > ?1)
					AND EXISTS (SELECT 1 FROM orders o WHERE o.id = waitlist_entries.order_id
						AND (o.status IN ('cancelled', 'expired', 'rejected')
							OR (o.status IN ${HOLDING} AND o.expires_at <= ?1))))
			ORDER BY event_slug`
		)
		.bind(now)
		.all();
	return results.map((r) => String(r.event_slug));
}

/**
 * La pasada del cron: {@link advanceWaitlist} sobre cada evento con anotaciones vivas. Un evento
 * que falla no frena a los demás. Con el interruptor apagado no hace nada (`null`). Los mails
 * salen después, en la tanda de `runMailQueue` (primero en el reparto).
 *
 * @param {D1Database} db
 * @param {{ enabled: boolean, now?: number, configOf?: ConfigOf }} input
 */
export async function runWaitlistCron(db, { enabled, now = Date.now(), configOf }) {
	if (!enabled) return null;
	const total = {
		events: 0,
		failed: 0,
		expired: 0,
		restored: 0,
		offered: 0,
		closed: 0,
		removed: 0,
		deleted: 0
	};
	for (const eventSlug of await waitlistEventsToSweep(db, now)) {
		total.events++;
		try {
			const r = await advanceWaitlist(db, { eventSlug, now, ...(configOf ? { configOf } : {}) });
			total.expired += r.expired;
			total.restored += r.restored;
			total.offered += r.offered;
			total.closed += r.closed;
			total.removed += r.removed;
			total.deleted += r.deleted;
		} catch (error) {
			total.failed++;
			console.error(`[lista de espera] no se pudo avanzar la lista de ${eventSlug}:`, error);
		}
	}
	return total;
}

/**
 * @typedef {{ id: string, event_slug: string, ticket_type: string | null, email: string,
 *   kind: WaitlistSendKind, round: number, hold_until: number | null,
 *   end_reason: string | null }} PendingMail
 */

/**
 * «Todavía no salió (ni se rindió) este mail de esta ronda.» Parámetro ?1 = now − STALE_CLAIM_MS.
 *
 * @param {WaitlistSendKind} kind
 * @param {string} round expresión SQL de la ronda
 */
const notSent = (kind, round) => `NOT EXISTS (SELECT 1 FROM waitlist_sends s
	WHERE s.entry_id = e.id AND s.kind = '${kind}' AND s.round = ${round}
	AND (s.status IN ('sent', 'failed') OR (s.status = 'sending' AND s.sent_at >= ?1)))`;

/** «El mail de la oferta de esta ronda ya salió.» */
const offerSent = `EXISTS (SELECT 1 FROM waitlist_sends s
	WHERE s.entry_id = e.id AND s.kind = 'offer' AND s.round = e.offer_count AND s.status = 'sent')`;

/**
 * «Une admin pidió avisarle que terminó su reserva» ({@link queueEndedMail}): la fila de
 * `waitlist_sends` de esa ronda, puesta antes de mandar.
 */
const endedMailAsked = `EXISTS (SELECT 1 FROM waitlist_sends s
	WHERE s.entry_id = e.id AND s.kind = 'expired' AND s.round = e.offer_count)`;

/**
 * Pide el mail «se terminó tu lugar» (`waitlist_ended`) para una reserva que une admin terminó
 * desde el panel («Terminar la reserva y pasar a la siguiente», con «Mandarle un mail»). No hay
 * columna para eso (sin migración): la marca es la fila del envío en `waitlist_sends` (`expired`,
 * la ronda de la oferta), en `retry` y sin intentos, que la próxima tanda reserva y manda como
 * cualquier otra. Sin esa fila, una reserva terminada por admin no recibe mail.
 *
 * Solo si terminó por `admin` y el mail de la oferta ya había salido (sin oferta, «se terminó tu
 * lugar» no se entiende). Devuelve `true` si quedó pedido.
 *
 * @param {D1Database} db
 * @param {string} entryId
 * @param {number} [now]
 */
export async function queueEndedMail(db, entryId, now = Date.now()) {
	const r = await db
		.prepare(
			`INSERT INTO waitlist_sends (entry_id, kind, round, status, attempts, sent_at)
			SELECT e.id, 'expired', e.offer_count, 'retry', 0, ?2
			FROM waitlist_entries e
			WHERE e.id = ?1 AND e.status = 'expired' AND e.end_reason = 'admin' AND ${offerSent}
			ON CONFLICT (entry_id, kind, round) DO NOTHING`
		)
		.bind(entryId, now)
		.run();
	return changes(r) === 1;
}

/**
 * Los mails de la lista que faltan mandar, en orden: ofertas, últimos avisos, vencidas, cierres.
 *
 * - oferta: anotación `offered` vigente sin el mail de esa ronda;
 * - último aviso: reserva de 12 h o más a la que le quedan 3 h o menos, con la oferta ya mandada;
 * - vencida: reserva vencida (`hold_expired`) en las últimas 48 h, con la oferta ya mandada; o
 *   terminada por admin con el mail pedido ({@link queueEndedMail}, sale «se terminó tu lugar»);
 * - cierre: lista cerrada (`closed` / `event_cancelled`) en las últimas 48 h.
 *
 * @param {D1Database} db
 * @param {{ now: number, eventSlug?: string | null }} o
 * @returns {Promise<PendingMail[]>}
 */
export async function pendingWaitlistMails(db, { now, eventSlug = null }) {
	const cols = 'e.id, e.event_slug, e.ticket_type, e.email, e.hold_until, e.end_reason';
	const ev = 'AND (?3 IS NULL OR e.event_slug = ?3)';
	const { results } = await db
		.prepare(
			`SELECT ${cols}, 'offer' AS kind, e.offer_count AS round, 1 AS prio, e.offered_at AS at
			FROM waitlist_entries e
			WHERE e.status = 'offered' AND (e.hold_until IS NULL OR e.hold_until > ?2) ${ev}
				AND ${notSent('offer', 'e.offer_count')}
			UNION ALL
			SELECT ${cols}, 'reminder', e.offer_count, 2, e.hold_until
			FROM waitlist_entries e
			WHERE e.status = 'offered' AND e.hold_until > ?2 AND e.hold_until - e.offered_at >= ?4
				AND e.hold_until - ?2 <= ?5 ${ev}
				AND ${offerSent} AND ${notSent('reminder', 'e.offer_count')}
			UNION ALL
			SELECT ${cols}, 'expired', e.offer_count, 3, e.ended_at
			FROM waitlist_entries e
			WHERE e.status = 'expired' AND e.ended_at > ?6 ${ev}
				AND (e.end_reason = 'hold_expired' OR (e.end_reason = 'admin' AND ${endedMailAsked}))
				AND ${offerSent} AND ${notSent('expired', 'e.offer_count')}
			UNION ALL
			SELECT ${cols}, 'closed', 0, 4, e.ended_at
			FROM waitlist_entries e
			WHERE e.status = 'expired' AND e.end_reason IN ('closed', 'event_cancelled')
				AND e.ended_at > ?6 ${ev} AND ${notSent('closed', '0')}
			ORDER BY prio, at, id`
		)
		.bind(
			now - STALE_CLAIM_MS,
			now,
			eventSlug,
			REMINDER_MIN_HOLD_MS,
			REMINDER_BEFORE_MS,
			now - ENDED_MAIL_WINDOW_MS
		)
		.all();
	return results.map((r) => ({
		id: String(r.id),
		event_slug: String(r.event_slug),
		ticket_type: r.ticket_type == null ? null : String(r.ticket_type),
		email: String(r.email),
		kind: /** @type {WaitlistSendKind} */ (String(r.kind)),
		round: Number(r.round),
		hold_until: r.hold_until == null ? null : Number(r.hold_until),
		end_reason: r.end_reason == null ? null : String(r.end_reason)
	}));
}

/** @type {Record<WaitlistSendKind, import('$lib/utils/emailTemplates.js').WaitlistTemplateId>} */
const TEMPLATE_OF = {
	offer: 'waitlist_offer',
	reminder: 'waitlist_reminder',
	expired: 'waitlist_expired',
	closed: 'waitlist_closed'
};

/**
 * La plantilla de un mail pendiente: «se venció» o, si la terminó une admin, «se terminó».
 * @param {PendingMail} m
 */
const templateOf = (m) =>
	m.kind === 'expired' && m.end_reason === 'admin' ? 'waitlist_ended' : TEMPLATE_OF[m.kind];

/**
 * Manda una tanda de los mails de la lista (como mucho `limit`), una sola vez por anotación,
 * mail y ronda (`sendBatch` con `waitlist_sends`; un fallo se reintenta en la próxima tanda,
 * hasta 3 veces, y después queda para «Para revisar»).
 *
 * @param {D1Database} db
 * @param {{ limit: number, send: WaitlistSend, origin: string, contactEmail?: string,
 *   now?: number, eventSlug?: string | null, configOf?: ConfigOf }} input
 * @returns {Promise<{ sent: number, failed: number, remaining: number }>}
 */
export async function sendWaitlistMails(db, input) {
	const { limit, send, origin, now = Date.now(), eventSlug = null } = input;
	const configOf = input.configOf ?? getEventTickets;
	await expireStaleClaims(db, 'waitlist_sends', now);
	const items = await pendingWaitlistMails(db, { now, eventSlug });
	/** @type {Map<string, Promise<EventTickets | null>>} */
	const configs = new Map();
	/** @type {Map<string, Promise<import('./email.js').Template>>} */
	const templates = new Map();
	/** @param {string} slug */
	const configFor = (slug) => {
		if (!configs.has(slug))
			configs.set(
				slug,
				configOf(slug).catch(() => null)
			);
		return /** @type {Promise<EventTickets | null>} */ (configs.get(slug));
	};
	/** @param {PendingMail} m */
	const templateFor = (m) => {
		const id = templateOf(m);
		const k = `${m.event_slug}\n${id}`;
		if (!templates.has(k)) templates.set(k, resolveTemplate(db, m.event_slug, id));
		return /** @type {Promise<import('./email.js').Template>} */ (templates.get(k));
	};
	return sendBatch(db, 'waitlist_sends', {
		items,
		limit,
		now,
		label: 'el mail de la lista de espera',
		claim: (m) => ({ entryId: m.id, key: [m.kind, m.kind === 'closed' ? 0 : m.round] }),
		send: async (m) => {
			const config = await configFor(m.event_slug);
			const event = { title: config?.title || m.event_slug, start: config?.start ?? null };
			const typeName = m.ticket_type
				? (config?.types.find((t) => t.id === m.ticket_type)?.name ?? m.ticket_type)
				: null;
			const common = {
				event,
				typeName,
				unsubscribeUrl: await waitlistLeaveUrl(db, origin, m.id),
				origin,
				contactEmail: input.contactEmail,
				template: await templateFor(m)
			};
			const offerUrl = async () =>
				waitlistOfferUrl(origin, m.event_slug, await offerToken(db, m.id, m.round));
			const message =
				m.kind === 'offer'
					? buildWaitlistOfferEmail({
							...common,
							offerUrl: await offerUrl(),
							holdUntil: m.hold_until
						})
					: m.kind === 'reminder'
						? buildWaitlistReminderEmail({
								...common,
								offerUrl: await offerUrl(),
								holdUntil: /** @type {number} */ (m.hold_until)
							})
						: m.kind === 'expired'
							? (m.end_reason === 'admin' ? buildWaitlistEndedEmail : buildWaitlistExpiredEmail)({
									...common,
									rejoinUrl: await waitlistRejoinUrl(db, origin, m.id)
								})
							: buildWaitlistClosedEmail({
									...common,
									reason: m.end_reason === 'event_cancelled' ? 'event_cancelled' : 'closed',
									eventUrl: `${origin.replace(/\/+$/, '')}/calendario/${encodeURIComponent(m.event_slug)}`
								});
			const result = await send(m.email, message, waitlistIdempotencyKey(m.kind, m.id, m.round));
			return result !== 'failed';
		}
	});
}

/**
 * El reparto de la tanda del cron para los mails de la lista (`sendWaitlist` de
 * `runMailQueueWith`), con el envío de siempre (`deliverEmail`).
 *
 * @param {{ db: D1Database, origin: string, fetch: typeof fetch, now?: number }} input
 * @returns {(limit: number) => Promise<{ sent: number, failed: number, remaining: number }>}
 */
export function waitlistMailBatch({ db, origin, fetch: fetchFn, now }) {
	return (limit) =>
		sendWaitlistMails(db, {
			limit,
			send: waitlistSender(db, fetchFn),
			origin,
			contactEmail: contactEmail(),
			...(now ? { now } : {})
		});
}

/**
 * @typedef {'no-db' | 'off' | 'idle' | 'throttled' | 'done' | 'error'} NudgeOutcome
 * - `off`: interruptor apagado; `idle`: el evento no tiene a nadie esperando ni con oferta;
 * - `throttled`: ya hubo un empujón para este evento en el último minuto (el cron sigue);
 * - `done`: avanzó la lista (y, con `fetch` y `origin`, mandó los mails de ese evento).
 */

/**
 * El empujón: avanza la lista de un evento ya (y manda sus mails), en segundo plano. Se llama
 * desde cada lugar donde se libera un lugar (docs/tickets.md, «Lista de espera»): no espera ni
 * tira nunca. Devuelve la tarea (para las pruebas); en Cloudflare queda en `ctx.waitUntil`.
 *
 * @param {{ platform?: App.Platform, db?: D1Database | null, eventSlug: string,
 *   origin?: string | null, fetch?: typeof fetch, now?: number }} input
 * @returns {Promise<NudgeOutcome>}
 */
export function queueWaitlistAdvance(input) {
	const task = nudge(input).catch((error) => {
		console.error(`[lista de espera] el empujón de ${input.eventSlug} falló:`, error);
		return /** @type {NudgeOutcome} */ ('error');
	});
	const ctx = input.platform?.ctx;
	if (ctx?.waitUntil) ctx.waitUntil(task);
	return task;
}

/**
 * @param {Parameters<typeof queueWaitlistAdvance>[0]} input
 * @returns {Promise<NudgeOutcome>}
 */
async function nudge({ platform, db: given, eventSlug, origin, fetch: fetchFn, now = Date.now() }) {
	const db = given ?? getDB(platform);
	if (!db || !eventSlug) return 'no-db';
	if (!(await isFlagOn(db, 'lista_espera'))) return 'off';
	const live = await db
		.prepare(
			`SELECT 1 AS ok FROM waitlist_entries WHERE event_slug = ?1
			AND (status IN ('waiting', 'offered')
				OR (status = 'purchased' AND (hold_until IS NULL OR hold_until > ?2)))
			LIMIT 1`
		)
		.bind(eventSlug, now)
		.first();
	if (!live) return 'idle';
	const rate = await hitRateLimit(db, `waitlist:advance:${eventSlug}`, NUDGE_RULE, now);
	if (!rate.allowed) return 'throttled';
	await advanceWaitlist(db, { eventSlug, now });
	if (fetchFn && origin) {
		await sendWaitlistMails(db, {
			limit: mailBatchSize((await getSalesSettings(db)).mail_batch_size),
			send: waitlistSender(db, fetchFn),
			origin,
			contactEmail: contactEmail(),
			eventSlug,
			now
		});
	}
	return 'done';
}

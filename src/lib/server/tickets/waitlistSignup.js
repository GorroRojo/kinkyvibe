/**
 * Anotarse en la lista de espera desde la página de compra (`?/waitlist`), confirmar, salir y
 * volver a anotarse con los links de los mails (docs/tickets.md, «Lista de espera»). Los cambios
 * de estado en sí están en ./waitlist.js; acá van las reglas de la página: cuándo se puede
 * anotar, los límites contra el abuso y el mail de confirmar.
 *
 * - Solo el mail (no hay nombre ni link). Con una cuenta con sesión cuyo mail verificado es ese,
 *   entra directo a la fila (respuesta 8 de gorrite); si no, le mandamos el mail de confirmar.
 * - La respuesta es la misma esté o no ese mail en la lista (nunca se revela quién está anotade).
 * - Límites, como en «Avisame si se repite» (series/subscriptions.js): por conexión, mails de
 *   confirmar a una misma dirección por día, el tope global de mails de Resend
 *   (`accountMailAllowed`) y anotaciones vivas por evento desde una misma conexión
 *   ({@link WAITLIST_SIGNUP_LIMITS}).
 * - Se puede anotar solo en un alcance agotado ({@link waitlistJoinStates}): el evento entero
 *   (`alcance: evento`) o un tipo con cupo (`alcance: tipo`). La fila cuenta como vendido: por
 *   evento, contra el lugar libre total del evento (respuesta 2 de gorrite); por tipo, contra el
 *   de ese tipo.
 *
 * El interruptor `lista_espera` lo mira quien llama (la ruta). Los logs nunca llevan el mail.
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { emailHash, normalizeEmail } from '$lib/server/cuentas/accounts.js';
import { accountMailAllowed } from '$lib/server/cuentas/mailCap.js';
import {
	WAITLIST_SETTINGS,
	effectiveWaitlistSettings,
	holdUntil
} from '$lib/utils/waitlistHold.js';
import { salesState, typeAvailability, typeClosesAt, typeOpen } from './config.js';
import { getTaken } from './orders.js';
import { resolveTemplate } from './templates.js';
import {
	WAITLIST_CONFIRM_TTL_MS,
	confirmWaitlistEntry,
	joinWaitlist,
	leaveWaitlist,
	rejoinWaitlist
} from './waitlist.js';
import { buildWaitlistConfirmEmail } from './waitlistEmail.js';
import { checkWaitlistLinkToken, waitlistConfirmUrl, waitlistLeaveUrl } from './waitlistMail.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./config.js').EventTickets} EventTickets */
/** @typedef {import('./waitlistMail.js').WaitlistSend} WaitlistSend */

/** Límites de anotarse. */
export const WAITLIST_SIGNUP_LIMITS = Object.freeze({
	/** Pedidos desde una misma conexión (para cualquier evento y mail). */
	client: { limit: 10, windowSeconds: 60 * 60 },
	/** Mails de confirmar a un mismo mail por día (no llenar casillas ajenas). */
	email: { limit: 3, windowSeconds: 24 * 60 * 60 },
	/** Anotaciones vivas en un mismo evento desde una misma conexión. */
	perEvent: 5
});

export const WAITLIST_MESSAGES = Object.freeze({
	badEmail: 'Revisá el mail: no parece una dirección válida.',
	tooMany: 'Hiciste varios pedidos seguidos. Esperá un rato y probá de nuevo.',
	mailBusy: 'Estamos mandando muchos mails en este momento. Probá en un rato.',
	mailFailed: 'No pudimos mandar el mail. Probá de nuevo en un rato.',
	noList: 'Este evento no tiene lista de espera.',
	badType: 'Elegí un tipo de entrada agotado.',
	closed: 'La lista de espera de este evento ya cerró.',
	notyet: 'Todavía no se puede anotar: la lista se abre cuando se agotan las entradas.',
	available: 'Todavía quedan entradas: podés comprarlas ahora.'
});

/**
 * Cómo está un alcance para anotarse:
 * - `open`: agotado, se puede anotar;
 * - `available`: todavía quedan entradas (se compran directo);
 * - `notyet`: la venta no abrió (o el tipo espera a que se agote otro);
 * - `closed`: cerró la lista (cerca del comienzo, cerró la venta, evento cancelado).
 * @typedef {'open' | 'available' | 'notyet' | 'closed'} JoinState
 * @typedef {{ ticketType: string | null, name: string | null, state: JoinState }} ScopeState
 */

/**
 * Cuántas personas guardan lugar en cada alcance del evento: las que esperan y las que tienen un
 * lugar guardado vigente (el aviso a toda la lista no guarda nada). Clave '' = todo el evento.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {number} now
 */
export async function waitlistHolders(db, eventSlug, now) {
	const { results } = await db
		.prepare(
			`SELECT COALESCE(ticket_type, '') AS scope, COUNT(*) AS n FROM waitlist_entries
			WHERE event_slug = ?1
			AND (status = 'waiting' OR (status = 'offered' AND hold_until > ?2))
			GROUP BY COALESCE(ticket_type, '')`
		)
		.bind(eventSlug, now)
		.all();
	return new Map(results.map((r) => [String(r.scope), Number(r.n)]));
}

/**
 * ¿Cerró la lista para este cierre de venta?
 * @param {import('$lib/utils/waitlistHold.js').WaitlistSettings} settings
 * @param {EventTickets} config
 * @param {number | null} salesClose
 * @param {number} now
 */
function listClosed(settings, config, salesClose, now) {
	return holdUntil({ now, start: config.start ?? null, salesClose, settings }).kind === 'closed';
}

/**
 * Los alcances de la lista de un evento y cómo está cada uno para anotarse. Vacío si el evento no
 * tiene lista. Por evento, un solo alcance (`ticketType` null); por tipo, uno por cada tipo con
 * cupo (un tipo sin cupo nunca se agota).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {EventTickets} config
 * @param {number} [now]
 * @returns {Promise<ScopeState[]>}
 */
export async function waitlistJoinStates(db, eventSlug, config, now = Date.now()) {
	const list = config.waitlist;
	if (!list) return [];
	const settings = effectiveWaitlistSettings(WAITLIST_SETTINGS, list);
	const sales = salesState(config, now);
	const typed = config.types.filter((t) => t.capacity !== null && t.capacity !== undefined);
	/** @param {JoinState} state @returns {ScopeState[]} */
	const all = (state) =>
		list.scope === 'event'
			? [{ ticketType: null, name: null, state }]
			: typed.map((t) => ({ ticketType: t.id, name: t.name, state }));
	if (config.status === 'cancelado') return all('closed');
	if (!sales.open && sales.reason === 'closed') return all('closed');
	if (!sales.open && sales.reason === 'notyet') return all('notyet');
	const soldOutByHand = config.status === 'agotadas';
	const taken = await getTaken(db, eventSlug, now);
	const holders = await waitlistHolders(db, eventSlug, now);

	if (list.scope === 'event') {
		if (listClosed(settings, config, config.closesAt, now)) return all('closed');
		if (soldOutByHand) return all('open');
		let free = 0;
		let unlimited = false;
		let waitingType = false;
		for (const t of config.types) {
			const a = typeAvailability(config, t, taken, now);
			if (a.state === 'waiting') waitingType = true;
			if (a.state !== 'open') continue;
			if (a.remaining === null) unlimited = true;
			else free += a.remaining;
		}
		const left = unlimited ? Infinity : free - (holders.get('') ?? 0);
		/** @type {JoinState} */
		const state = left > 0 ? 'available' : waitingType && free === 0 ? 'notyet' : 'open';
		return all(state);
	}

	return typed.map((t) => {
		/** @type {ScopeState} */
		const scope = { ticketType: t.id, name: t.name, state: 'open' };
		if (!typeOpen(config, t, now) || listClosed(settings, config, typeClosesAt(config, t), now))
			return { ...scope, state: 'closed' };
		if (soldOutByHand) return scope;
		const a = typeAvailability(config, t, taken, now);
		if (a.state === 'waiting') return { ...scope, state: 'notyet' };
		const remaining = a.state === 'open' ? (a.remaining ?? Infinity) : 0;
		return remaining - (holders.get(t.id) ?? 0) > 0 ? { ...scope, state: 'available' } : scope;
	});
}

/**
 * @typedef {{ ok: true, status: 'pending' | 'waiting' }
 *   | { ok: false, status: number, message: string }} SignupResult
 * - `pending`: «Te mandamos un mail para confirmar» (también si ya estaba anotade).
 * - `waiting`: con cuenta, ya está en la fila (sin mail).
 */

/** @param {D1Database} db @param {string} bucket @param {import('$lib/server/db/rateLimit.js').RateLimitRule} rule @param {number} now */
async function allowed(db, bucket, rule, now) {
	return (await hitRateLimit(db, bucket, rule, now)).allowed;
}

/**
 * La anotación viva de un mail en un alcance (su estado), o `null`.
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string | null} ticketType
 * @param {string} email
 */
async function liveStatus(db, eventSlug, ticketType, email) {
	const row = await db
		.prepare(
			`SELECT status FROM waitlist_entries
			WHERE event_slug = ?1 AND COALESCE(ticket_type, '') = ?2 AND email = ?3
			AND status IN ('pending_confirmation','waiting','offered')`
		)
		.bind(eventSlug, ticketType ?? '', email)
		.first();
	return row ? String(row.status) : null;
}

/**
 * Anota un mail en la lista de un evento (o de un tipo) desde la página de compra.
 *
 * @param {{ db: D1Database, eventSlug: string, config: EventTickets, ticketType?: unknown,
 *   email: unknown, member?: { id: string, email: string } | null, client: string,
 *   send: WaitlistSend, origin: string, contactEmail?: string, now?: number }} input
 *   `client`: el hash de la conexión (`clientHash` de safeguards.js), que queda en la anotación.
 * @returns {Promise<SignupResult>}
 */
export async function signUpForWaitlist({
	db,
	eventSlug,
	config,
	ticketType: rawType,
	email: rawEmail,
	member = null,
	client,
	send,
	origin,
	contactEmail,
	now = Date.now()
}) {
	if (!config.waitlist) return { ok: false, status: 404, message: WAITLIST_MESSAGES.noList };
	const email = normalizeEmail(rawEmail);
	if (!email) return { ok: false, status: 400, message: WAITLIST_MESSAGES.badEmail };
	const states = await waitlistJoinStates(db, eventSlug, config, now);
	const wanted = config.waitlist.scope === 'event' ? null : String(rawType ?? '').trim();
	const scope = states.find((s) => s.ticketType === wanted);
	if (!scope) return { ok: false, status: 400, message: WAITLIST_MESSAGES.badType };
	if (scope.state !== 'open')
		return { ok: false, status: 409, message: WAITLIST_MESSAGES[scope.state] };
	const ticketType = scope.ticketType;
	const tooMany = /** @type {const} */ ({
		ok: false,
		status: 429,
		message: WAITLIST_MESSAGES.tooMany
	});

	// En orden: cada límite cuenta solo si pasó el anterior (un pedido rechazado no gasta el cupo
	// del mail de otra persona).
	const clientKey = await sha256Hex(`waitlist:client:${client}`);
	if (!(await allowed(db, `waitlist:join:c:${clientKey}`, WAITLIST_SIGNUP_LIMITS.client, now)))
		return tooMany;
	const live = await liveStatus(db, eventSlug, ticketType, email);
	if (!live) {
		const mine = await db
			.prepare(
				`SELECT COUNT(*) AS n FROM waitlist_entries WHERE event_slug = ?1 AND client_hash = ?2
				AND status IN ('pending_confirmation','waiting','offered')`
			)
			.bind(eventSlug, client)
			.first();
		if (Number(mine?.n ?? 0) >= WAITLIST_SIGNUP_LIMITS.perEvent) return tooMany;
	}

	// Con cuenta y su mail (verificado): directo a la fila, sin mail.
	const accountId = member && normalizeEmail(member.email) === email ? member.id : null;
	if (accountId) {
		const r = await joinWaitlist(db, {
			eventSlug,
			ticketType,
			email,
			accountId,
			clientHash: client,
			now
		});
		if (r.ok && r.status !== 'pending') return { ok: true, status: 'waiting' };
		// La cuenta no tiene el mail verificado: sigue como sin cuenta (con el mail de confirmar).
	} else if (live && live !== 'pending_confirmation') {
		// Ya en la fila (o con un lugar ofrecido): no se manda nada y se responde igual.
		return { ok: true, status: 'pending' };
	}

	if (
		!(await allowed(
			db,
			`waitlist:join:e:${await emailHash(email)}`,
			WAITLIST_SIGNUP_LIMITS.email,
			now
		))
	)
		return tooMany;
	if (!(await accountMailAllowed(db, now)))
		return { ok: false, status: 429, message: WAITLIST_MESSAGES.mailBusy };

	const joined = await joinWaitlist(db, { eventSlug, ticketType, email, clientHash: client, now });
	if (!joined.ok) return { ok: false, status: 400, message: WAITLIST_MESSAGES.badEmail };
	if (joined.status !== 'pending') return { ok: true, status: 'pending' };
	const message = buildWaitlistConfirmEmail({
		event: { title: config.title || eventSlug, start: config.start ?? null },
		typeName: scope.name,
		confirmUrl: waitlistConfirmUrl(origin, joined.token),
		unsubscribeUrl: await waitlistLeaveUrl(db, origin, joined.id),
		expiresAt: now + WAITLIST_CONFIRM_TTL_MS,
		now,
		origin,
		contactEmail,
		template: await resolveTemplate(db, eventSlug, 'waitlist_confirm')
	});
	const result = await send(email, message);
	if (result === 'failed') return { ok: false, status: 502, message: WAITLIST_MESSAGES.mailFailed };
	return { ok: true, status: 'pending' };
}

/**
 * El evento y el tipo de una anotación (para nombrarlos en las páginas de los links), o `null`.
 *
 * @param {D1Database} db
 * @param {string} id
 * @returns {Promise<{ eventSlug: string, ticketType: string | null, status: string } | null>}
 */
export async function waitlistEntryInfo(db, id) {
	const row = await db
		.prepare('SELECT event_slug, ticket_type, status FROM waitlist_entries WHERE id = ?1')
		.bind(id)
		.first();
	if (!row) return null;
	return {
		eventSlug: String(row.event_slug),
		ticketType: row.ticket_type == null ? null : String(row.ticket_type),
		status: String(row.status)
	};
}

/**
 * Confirmar con el link del mail (solo por POST). `null` si el link venció, ya se usó o no existe.
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @param {number} [now]
 */
export function confirmByToken(db, token, now = Date.now()) {
	return confirmWaitlistEntry(db, token, now);
}

/**
 * Salir con el link firmado de un mail (solo por POST). `{ ok: false }` si la firma no vale;
 * `left: false` si ya no estaba en la fila (salió antes, compró, venció o cerró la lista).
 *
 * @param {D1Database} db
 * @param {unknown} token `<id>.<firma>`
 * @param {number} [now]
 * @returns {Promise<{ ok: false } | { ok: true, left: boolean, was: string | null,
 *   eventSlug: string | null }>}
 */
export async function leaveByToken(db, token, now = Date.now()) {
	const id = await checkWaitlistLinkToken(db, 'leave', token);
	if (!id) return { ok: false };
	const info = await waitlistEntryInfo(db, id);
	const ended = await leaveWaitlist(db, id, { now });
	if (ended) return { ok: true, left: true, was: ended.was, eventSlug: ended.eventSlug };
	return { ok: true, left: false, was: null, eventSlug: info?.eventSlug ?? null };
}

/**
 * «Volver a anotarme» con el link firmado del mail de «se venció tu lugar» (solo por POST): al
 * final de la fila, sin confirmar de nuevo (respuesta 4 de gorrite). Solo si el evento sigue con
 * lista y la lista no cerró (`configOf` lee la configuración del evento).
 *
 * @param {D1Database} db
 * @param {unknown} token `<id>.<firma>`
 * @param {{ configOf: (slug: string) => Promise<EventTickets | null>, now?: number }} opts
 * @returns {Promise<{ ok: false, reason: 'invalid' | 'closed' | 'gone' }
 *   | { ok: true, status: 'waiting' | 'already', eventSlug: string }>}
 */
export async function rejoinByToken(db, token, { configOf, now = Date.now() }) {
	const id = await checkWaitlistLinkToken(db, 'rejoin', token);
	if (!id) return { ok: false, reason: 'invalid' };
	const info = await waitlistEntryInfo(db, id);
	if (!info) return { ok: false, reason: 'gone' };
	const config = await configOf(info.eventSlug);
	if (!config?.waitlist) return { ok: false, reason: 'closed' };
	const states = await waitlistJoinStates(db, info.eventSlug, config, now);
	const scope = states.find((s) => s.ticketType === info.ticketType);
	if (!scope || scope.state === 'closed') return { ok: false, reason: 'closed' };
	const r = await rejoinWaitlist(db, id, now);
	if (!r) return { ok: false, reason: 'gone' };
	return { ok: true, status: r.status, eventSlug: info.eventSlug };
}

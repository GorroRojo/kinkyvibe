/**
 * Links y envío de los mails de la lista de espera (docs/tickets.md, «Lista de espera»).
 *
 * - Links: confirmar (`/lista-de-espera/confirmar/<token>`, el token de `joinWaitlist`), salir
 *   (`/lista-de-espera/salir/<id>.<firma>`) y volver a anotarse
 *   (`/lista-de-espera/volver/<id>.<firma>`). Salir y volver van firmados con la clave
 *   `waitlist_leave_key` (`signLink`, se crea sola), cada uno con su propio mensaje: un link no
 *   sirve para lo otro. La oferta (`/calendario/<slug>/entradas?lista=<token>`) lleva el token
 *   que arma el motor.
 * - Envío: el de confirmar sale en el momento (como en «Avisame si se repite»). Los otros cuatro
 *   van por el cron con `waitlist_sends` ({@link sendWaitlistEntryMail}): una fila por anotación,
 *   mail y ronda, reservada antes de mandar (nunca sale dos veces) y con la clave de idempotencia
 *   de Resend `waitlist-<mail>-<id>-<ronda>` (`waitlist-closed-<id>` para el cierre).
 *
 * Los logs nunca llevan el mail: solo el id de la anotación.
 */
import { signLink, verifyLink } from '$lib/server/signedLinks.js';
import { deliverEmail } from './index.js';
import { claimSend, finishSend } from './sendState.js';
import { resendBackoff } from './email.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {(to: string, message: { subject: string, html: string, text: string },
 *   idempotencyKey?: string) => Promise<'sent' | 'simulated' | 'failed'>} WaitlistSend
 */

/** Clave de `ticket_settings` que firma los links de salir y de volver a anotarse. */
export const WAITLIST_LEAVE_KEY = 'waitlist_leave_key';

/** Los mails de la lista que van por el cron (`waitlist_sends.kind`). */
export const WAITLIST_SEND_KINDS = /** @type {const} */ ([
	'offer',
	'reminder',
	'expired',
	'closed'
]);
/** @typedef {(typeof WAITLIST_SEND_KINDS)[number]} WaitlistSendKind */

const ID_TOKEN_RE = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/;

/** @param {string} origin */
const base = (origin) => origin.replace(/\/+$/, '');

/**
 * @param {string} origin
 * @param {string} token el de `joinWaitlist` (status `pending`)
 */
export function waitlistConfirmUrl(origin, token) {
	return `${base(origin)}/lista-de-espera/confirmar/${token}`;
}

/**
 * Link para salir de la lista (va en todos los mails).
 *
 * @param {D1Database} db
 * @param {string} origin
 * @param {string} entryId
 */
export async function waitlistLeaveUrl(db, origin, entryId) {
	const sig = await signLink(db, WAITLIST_LEAVE_KEY, `leave:${entryId}`);
	return `${base(origin)}/lista-de-espera/salir/${entryId}.${sig}`;
}

/**
 * Link «Volver a anotarme» del mail de «se venció tu lugar».
 *
 * @param {D1Database} db
 * @param {string} origin
 * @param {string} entryId la anotación que venció
 */
export async function waitlistRejoinUrl(db, origin, entryId) {
	const sig = await signLink(db, WAITLIST_LEAVE_KEY, `rejoin:${entryId}`);
	return `${base(origin)}/lista-de-espera/volver/${entryId}.${sig}`;
}

/**
 * Link de la compra con una oferta (el token lo arma el motor; acá solo se arma la dirección).
 *
 * @param {string} origin
 * @param {string} eventSlug
 * @param {string} token
 */
export function waitlistOfferUrl(origin, eventSlug, token) {
	return `${base(origin)}/calendario/${encodeURIComponent(eventSlug)}/entradas?lista=${encodeURIComponent(token)}`;
}

/**
 * El id de la anotación de un link firmado, o `null` si la firma no es de ese uso.
 *
 * @param {D1Database} db
 * @param {'leave' | 'rejoin'} use
 * @param {unknown} token `<id>.<firma>`
 */
export async function checkWaitlistLinkToken(db, use, token) {
	if (typeof token !== 'string') return null;
	const m = token.match(ID_TOKEN_RE);
	if (!m) return null;
	return (await verifyLink(db, WAITLIST_LEAVE_KEY, `${use}:${m[1]}`, m[2])) ? m[1] : null;
}

/**
 * Manda los mails de la lista por el camino de siempre (`deliverEmail`: Resend, el filtro
 * `routeEmail` de los previews con EMAIL_ALLOWLIST y el remitente de los ajustes).
 *
 * `batch`: lo usa una tanda (`sendBatch` en sendState.js): un «ahora no» de Resend (cupo, tasa,
 * 5xx; `resendBackoff`) sigue de largo como error, así la tanda no gasta el intento y se corta.
 * Sin él (la anotación, el panel) nunca tira.
 *
 * @param {D1Database} db
 * @param {typeof fetch} fetchFn
 * @param {{ batch?: boolean }} [options]
 * @returns {WaitlistSend}
 */
export function waitlistSender(db, fetchFn, { batch = false } = {}) {
	return async (to, message, idempotencyKey) => {
		try {
			// Ninguno es de una compra: respetan «No fui yo» (email/suppressions.js).
			return await deliverEmail({
				db,
				fetch: fetchFn,
				to,
				message,
				idempotencyKey,
				optOut: true,
				kind: 'lista-espera'
			});
		} catch (e) {
			if (batch && resendBackoff(e)) throw e;
			console.error('[lista de espera] no se pudo mandar el mail:', e);
			return 'failed';
		}
	};
}

/**
 * Clave de idempotencia de Resend de un mail de la lista.
 *
 * @param {WaitlistSendKind} kind
 * @param {string} entryId
 * @param {number} round
 */
export function waitlistIdempotencyKey(kind, entryId, round) {
	return kind === 'closed' ? `waitlist-closed-${entryId}` : `waitlist-${kind}-${entryId}-${round}`;
}

/**
 * Manda un mail de la lista que va por el cron (oferta, último aviso, vencida, cierre), una sola
 * vez por anotación, mail y ronda (`waitlist_sends`, ver sendState.js). Devuelve:
 *
 * - `skipped`: otra corrida ya lo tiene (o ya salió, o se rindió): no se manda nada;
 * - `sent`: salió (o se simuló, sin Resend);
 * - `failed`: falló; queda `retry` (o `failed` después de 3 intentos, para «Para revisar»).
 *
 * `build` arma el mensaje solo si esta corrida lo manda (así no se firma nada de más).
 *
 * @param {D1Database} db
 * @param {{ entryId: string, kind: WaitlistSendKind, round: number, to: string,
 *   build: () => Promise<{ subject: string, html: string, text: string }>
 *     | { subject: string, html: string, text: string },
 *   send: WaitlistSend, now?: number }} input
 * @returns {Promise<'skipped' | 'sent' | 'failed'>}
 */
export async function sendWaitlistEntryMail(
	db,
	{ entryId, kind, round, to, build, send, now = Date.now() }
) {
	if (!WAITLIST_SEND_KINDS.includes(kind)) throw new RangeError(`Mail desconocido: ${kind}`);
	const key = /** @type {const} */ ([kind, kind === 'closed' ? 0 : round]);
	if (!(await claimSend(db, 'waitlist_sends', { entryId, key, now }))) return 'skipped';
	let ok = false;
	try {
		const result = await send(to, await build(), waitlistIdempotencyKey(kind, entryId, round));
		ok = result !== 'failed';
	} catch (error) {
		console.error(
			`[lista de espera] no se pudo mandar «${kind}» a la anotación ${entryId}:`,
			error
		);
	}
	await finishSend(db, 'waitlist_sends', { entryId, key, ok, now });
	return ok ? 'sent' : 'failed';
}

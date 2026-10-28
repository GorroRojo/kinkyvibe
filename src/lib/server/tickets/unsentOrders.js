/**
 * Reintento del mail con las entradas: si el envío al aprobarse una orden falló (Resend caído, un
 * timeout, el Worker que se cortó), el cron de cada 15 minutos
 * (src/routes/api/cron/recordatorios/+server.js) lo vuelve a mandar. Ver docs/mails.md.
 *
 * - Toma órdenes aprobadas sin `email_sent_at`, con mail, aprobadas (`updated_at`) hace más de
 *   {@link EMAIL_GRACE_MS} (el envío normal es en segundo plano y puede tardar) y hace menos de
 *   {@link RETRY_WINDOW_MS}; las más viejas primero, como mucho `limit` por corrida.
 * - Manda con `sendOrderEmailResult` y la misma clave de idempotencia de siempre
 *   (`tickets-<orden>`): si el primer intento sí había salido, Resend no lo duplica.
 * - Un dominio que no recibe correo (`undeliverable`, email/mx.js): `sendOrderEmailResult` ya marcó
 *   la orden como enviada y rebotada; acá solo cuenta como salteada.
 * - Un mail cortado a propósito (`simulated`: «No fui yo» en una orden gratis, un preview sin
 *   EMAIL_ALLOWLIST, dev sin clave) cuenta como resuelto: se marca `email_sent_at` (como hacen los
 *   envíos en tandas con su estado 'sent') y no se vuelve a tomar.
 * - Las órdenes gratis pasan además por el tope de mails a una dirección sin confirmar
 *   (`unconfirmedMailAllowed`): el reintento no puede saltearse ese tope.
 * - Cada orden se intenta como mucho {@link RETRY_ATTEMPTS} veces por día (`rate_limits`, la clave
 *   lleva el id de la orden, que no es un dato personal): una dirección que Resend rechaza siempre
 *   no ocupa la tanda dos días seguidos. Las que se saltean no cuentan para `limit`.
 * - Si Resend dice «ahora no» (cupo terminado, demasiados por segundo o un 5xx; `resendBackoff` en
 *   email.js), ese intento no cuenta (`deferred`). Con el cupo o la tasa la corrida se corta ahí
 *   (`stopped`); con dos 5xx, también. La ventana de 48 h pone el techo.
 */
import { EMAIL_GRACE_MS } from '../admin/inicio.js';
import { hitRateLimit, releaseRateLimitHit } from '../db/rateLimit.js';
import { isFreeOrder, unconfirmedMailAllowed } from '../email/suppressions.js';
import { sendOrderEmailResult } from './index.js';
import { markEmailSent } from './orders.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Pasado esto desde la aprobación, el mail ya no se reintenta solo (queda «Reenviar»). */
export const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Intentos por orden y por día. */
export const RETRY_ATTEMPTS = 3;
/** Cuántas candidatas se leen por cada mail de la tanda (deja lugar a las salteadas). */
const SCAN_FACTOR = 4;
/** La ventana de los intentos por orden. */
const RETRY_RULE = Object.freeze({ limit: RETRY_ATTEMPTS, windowSeconds: 24 * 60 * 60 });

/**
 * @param {{
 *   db: D1Database,
 *   origin: string,
 *   fetch: typeof fetch,
 *   now?: number,
 *   limit?: number
 * }} input
 * @returns {Promise<{ sent: number, failed: number, skipped: number, deferred?: number,
 *   stopped?: 'quota' | 'rate' | 'server' }>} `deferred` y `stopped`, solo si pasó.
 */
export async function resendUnsentOrderEmails({
	db,
	origin,
	fetch: fetchFn,
	now = Date.now(),
	limit = 5
}) {
	const counts = { sent: 0, failed: 0, skipped: 0 };
	let deferred = 0;
	let serverErrors = 0;
	/** @type {'quota' | 'rate' | 'server' | undefined} */
	let stopped;
	const { results } = await db
		.prepare(
			`SELECT * FROM orders
			WHERE status = 'approved' AND email_sent_at IS NULL
				AND buyer_email IS NOT NULL AND TRIM(buyer_email) != ''
				AND updated_at >= ?1 AND updated_at <= ?2
			ORDER BY updated_at ASC LIMIT ?3`
		)
		.bind(now - RETRY_WINDOW_MS, now - EMAIL_GRACE_MS, limit * SCAN_FACTOR)
		.all();
	let attempted = 0;
	for (const order of /** @type {import('./orders.js').Order[]} */ (results)) {
		if (attempted >= limit) break;
		const bucket = `mail:reintento-entradas:${order.id}`;
		const tries = await hitRateLimit(db, bucket, RETRY_RULE, now);
		if (!tries.allowed) {
			counts.skipped++;
			continue;
		}
		attempted++;
		if (isFreeOrder(order) && !(await unconfirmedMailAllowed(db, order.buyer_email, now))) {
			counts.skipped++;
			continue;
		}
		const result = await sendOrderEmailResult({ db, order, origin, fetch: fetchFn });
		if (result === 'quota' || result === 'rate' || result === 'server') {
			// Resend no lo tomó: el intento no cuenta.
			await releaseRateLimitHit(db, bucket, RETRY_RULE, now);
			deferred++;
			if (result !== 'server' || ++serverErrors >= 2) {
				stopped = result;
				break;
			}
		} else if (result === 'sent') counts.sent++;
		else if (result === 'failed') counts.failed++;
		// El dominio no recibe correo: la orden ya quedó enviada y con el rebote marcado (no se
		// marca de nuevo: `markEmailSent` borraría el rebote).
		else if (result === 'undeliverable') counts.skipped++;
		else {
			await markEmailSent(db, order.id, now);
			counts.skipped++;
		}
	}
	if (counts.sent || counts.failed) {
		console.log(
			`[tickets] reintento de mails de entradas: ${counts.sent} enviados, ${counts.failed} fallaron`
		);
	}
	return { ...counts, ...(deferred ? { deferred } : {}), ...(stopped ? { stopped } : {}) };
}

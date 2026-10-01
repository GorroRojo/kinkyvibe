/**
 * "Avisame si se repite": suscripciones a una serie (tabla `series_subscriptions`, migración
 * 0020). Dos formas:
 *
 * - **Sin cuenta**: con el mail y doble confirmación. Se guarda el mail (hace falta para el aviso)
 *   y el hash del token del link de confirmar; sin confirmar no se le manda nada más, y el pedido
 *   vence en CONFIRM_TTL_MS (el cron lo borra).
 * - **Con cuenta** (interruptor `cuentas` prendido y sesión abierta): confirmada en el acto, sin
 *   guardar el mail (se usa el de la cuenta al mandar).
 *
 * Darse de baja borra la fila. El link de baja va firmado ($lib/server/signedLinks.js), así se
 * puede poner en cada mail sin guardar otro token. Los mensajes nunca dicen si un mail ya estaba
 * suscripto. Límites con db/rateLimit.js (por conexión, por mail y el tope global de mails de
 * cuentas, que comparte la cuenta de Resend).
 */
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { sha256Hex } from '$lib/server/hash.js';
import { signLink, verifyLink } from '$lib/server/signedLinks.js';
import { emailHash, normalizeEmail } from '$lib/server/cuentas/accounts.js';
import { randomToken } from '$lib/server/cuentas/crypto.js';
import { accountMailAllowed } from '$lib/server/cuentas/mailCap.js';
import { buildSeriesConfirmEmail } from './email.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {(to: string, message: { subject: string, html: string, text: string }, idempotencyKey?: string) => Promise<'sent' | 'simulated' | 'failed'>} SeriesSend */

/** Cuánto vale el link de confirmar. */
export const CONFIRM_TTL_MS = 48 * 60 * 60 * 1000;

/** Clave de `ticket_settings` que firma los links de baja (se crea sola). */
const UNSUBSCRIBE_KEY = 'series_unsubscribe_key';

export const SUBSCRIBE_LIMITS = Object.freeze({
	/** Pedidos desde una misma conexión (para cualquier serie y mail). */
	client: { limit: 10, windowSeconds: 60 * 60 },
	/** Mails de confirmación a un mismo mail por día (no llenar casillas ajenas). */
	email: { limit: 3, windowSeconds: 24 * 60 * 60 },
	/** Suscripciones con cuenta por hora (no hay mail de por medio, pero igual se topea). */
	account: { limit: 30, windowSeconds: 60 * 60 }
});

export const SERIES_MESSAGES = Object.freeze({
	badEmail: 'Revisá el mail: no parece una dirección válida.',
	tooMany: 'Hiciste varios pedidos seguidos. Esperá un rato y probá de nuevo.',
	mailBusy: 'Estamos mandando muchos mails en este momento. Probá en un rato.',
	mailFailed: 'No pudimos mandar el mail. Probá de nuevo en un rato.'
});

/** @param {string} client */
const clientKey = (client) => sha256Hex(`series:client:${client}`);

/**
 * @param {D1Database} db
 * @param {string} bucket
 * @param {import('$lib/server/db/rateLimit.js').RateLimitRule} rule
 * @param {number} now
 */
async function allowed(db, bucket, rule, now) {
	return (await hitRateLimit(db, bucket, rule, now)).allowed;
}

/**
 * Link de baja de una suscripción: `<origin>/avisos/baja/<id>.<firma>`.
 *
 * @param {D1Database} db
 * @param {string} origin
 * @param {string} id
 */
export async function unsubscribeUrl(db, origin, id) {
	return `${origin}/avisos/baja/${id}.${await signLink(db, UNSUBSCRIBE_KEY, `unsub:${id}`)}`;
}

/**
 * @param {string} origin
 * @param {string} token
 */
export function confirmUrl(origin, token) {
	return `${origin}/avisos/confirmar/${token}`;
}

/**
 * @typedef {{ ok: true, status: 'pending' | 'confirmed' } | { ok: false, status: number, message: string }} SubscribeResult
 */

/**
 * Suscribe un mail (sin cuenta): manda el mail de confirmar. La respuesta es la misma si el mail
 * ya estaba suscripto (y entonces no se manda nada).
 *
 * @param {{ db: D1Database, seriesTag: string, seriesName: string, email: unknown,
 *   client: string, send: SeriesSend, origin: string, now?: number }} input
 * @returns {Promise<SubscribeResult>}
 */
export async function subscribeEmail({
	db,
	seriesTag,
	seriesName,
	email: rawEmail,
	client,
	send,
	origin,
	now = Date.now()
}) {
	const email = normalizeEmail(rawEmail);
	if (!email) return { ok: false, status: 400, message: SERIES_MESSAGES.badEmail };
	const hash = await emailHash(email);
	const tooMany = /** @type {const} */ ({
		ok: false,
		status: 429,
		message: SERIES_MESSAGES.tooMany
	});
	// En orden: cada límite cuenta solo si pasó el anterior (un pedido rechazado no gasta el
	// cupo del mail de otra persona).
	if (!(await allowed(db, `series:sub:c:${await clientKey(client)}`, SUBSCRIBE_LIMITS.client, now)))
		return tooMany;
	const subscriberKey = `e:${hash}`;
	const existing = await db
		.prepare(
			'SELECT id, confirmed_at FROM series_subscriptions WHERE series_tag = ?1 AND subscriber_key = ?2'
		)
		.bind(seriesTag, subscriberKey)
		.first();
	// Ya confirmada: no se manda nada y se responde igual (no se revela quién está suscripte).
	if (existing && existing.confirmed_at != null) return { ok: true, status: 'pending' };
	if (!(await allowed(db, `series:sub:e:${hash}`, SUBSCRIBE_LIMITS.email, now))) return tooMany;
	if (!(await accountMailAllowed(db, now)))
		return { ok: false, status: 429, message: SERIES_MESSAGES.mailBusy };

	const token = randomToken();
	const confirmHash = await sha256Hex(token);
	const id = existing ? String(existing.id) : crypto.randomUUID();
	if (existing) {
		await db
			.prepare(
				`UPDATE series_subscriptions SET confirm_hash = ?2, confirm_expires_at = ?3
				WHERE id = ?1 AND confirmed_at IS NULL`
			)
			.bind(id, confirmHash, now + CONFIRM_TTL_MS)
			.run();
	} else {
		await db
			.prepare(
				`INSERT INTO series_subscriptions
					(id, series_tag, email, subscriber_key, confirm_hash, confirm_expires_at, created_at)
				VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
				ON CONFLICT (series_tag, subscriber_key) DO NOTHING`
			)
			.bind(id, seriesTag, email, subscriberKey, confirmHash, now + CONFIRM_TTL_MS, now)
			.run();
	}
	const message = buildSeriesConfirmEmail({
		seriesName,
		confirmUrl: confirmUrl(origin, token),
		unsubscribeUrl: await unsubscribeUrl(db, origin, id),
		hours: Math.round(CONFIRM_TTL_MS / 3_600_000)
	});
	const result = await send(email, message);
	if (result === 'failed') return { ok: false, status: 502, message: SERIES_MESSAGES.mailFailed };
	return { ok: true, status: 'pending' };
}

/**
 * Suscribe una cuenta (confirmada en el acto; el mail es el de la cuenta).
 *
 * @param {{ db: D1Database, seriesTag: string, accountId: string, now?: number }} input
 * @returns {Promise<SubscribeResult>}
 */
export async function subscribeAccount({ db, seriesTag, accountId, now = Date.now() }) {
	if (!(await allowed(db, `series:sub:a:${accountId}`, SUBSCRIBE_LIMITS.account, now)))
		return { ok: false, status: 429, message: SERIES_MESSAGES.tooMany };
	await db
		.prepare(
			`INSERT INTO series_subscriptions
				(id, series_tag, account_id, subscriber_key, created_at, confirmed_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?5)
			ON CONFLICT (series_tag, subscriber_key) DO NOTHING`
		)
		.bind(crypto.randomUUID(), seriesTag, accountId, `a:${accountId}`, now)
		.run();
	return { ok: true, status: 'confirmed' };
}

/**
 * Confirma con el token del link. Devuelve la serie, o `null` si el link no vale (venció, ya se
 * usó o nunca existió).
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @param {number} [now]
 * @returns {Promise<string | null>}
 */
export async function confirmSubscription(db, token, now = Date.now()) {
	if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
	const row = await db
		.prepare(
			`UPDATE series_subscriptions
			SET confirmed_at = ?2, confirm_hash = NULL, confirm_expires_at = NULL
			WHERE confirm_hash = ?1 AND confirmed_at IS NULL AND confirm_expires_at > ?2
			RETURNING series_tag`
		)
		.bind(await sha256Hex(token), now)
		.first();
	return row ? String(row.series_tag) : null;
}

/**
 * ¿El link de baja es válido? Devuelve el id de la suscripción o `null`.
 *
 * @param {D1Database} db
 * @param {unknown} token `<id>.<firma>`
 */
export async function checkUnsubscribeToken(db, token) {
	if (typeof token !== 'string') return null;
	const m = token.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/);
	if (!m) return null;
	return (await verifyLink(db, UNSUBSCRIBE_KEY, `unsub:${m[1]}`, m[2])) ? m[1] : null;
}

/**
 * Da de baja con el link del mail (borra la fila). `{ ok: false }` si el link no es válido;
 * `{ ok: true, seriesTag: null }` si ya se había dado de baja.
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @returns {Promise<{ ok: false } | { ok: true, seriesTag: string | null }>}
 */
export async function unsubscribe(db, token) {
	const id = await checkUnsubscribeToken(db, token);
	if (!id) return { ok: false };
	const row = await db
		.prepare('DELETE FROM series_subscriptions WHERE id = ?1 RETURNING series_tag')
		.bind(id)
		.first();
	return { ok: true, seriesTag: row ? String(row.series_tag) : null };
}

/**
 * La serie de una suscripción (para mostrar el nombre en la página de baja), o `null`.
 *
 * @param {D1Database} db
 * @param {string} id
 */
export async function subscriptionSeries(db, id) {
	const row = await db
		.prepare('SELECT series_tag FROM series_subscriptions WHERE id = ?1')
		.bind(id)
		.first();
	return row ? String(row.series_tag) : null;
}

/**
 * Baja de una cuenta (desde Mi rincón o la página de la serie).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} seriesTag
 */
export async function unsubscribeAccount(db, accountId, seriesTag) {
	await db
		.prepare('DELETE FROM series_subscriptions WHERE account_id = ?1 AND series_tag = ?2')
		.bind(accountId, seriesTag)
		.run();
}

/**
 * Las series a las que está suscripta una cuenta.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<string[]>}
 */
export async function accountSubscriptions(db, accountId) {
	const { results } = await db
		.prepare(
			'SELECT series_tag FROM series_subscriptions WHERE account_id = ?1 ORDER BY series_tag'
		)
		.bind(accountId)
		.all();
	return results.map((r) => String(r.series_tag));
}

/**
 * Cuántas personas hay por serie (confirmadas y esperando confirmar). Solo para el panel: nunca
 * los mails.
 *
 * @param {D1Database} db
 * @returns {Promise<Map<string, { confirmed: number, pending: number }>>}
 */
export async function subscriberCounts(db) {
	const { results } = await db
		.prepare(
			`SELECT series_tag,
				SUM(CASE WHEN confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmed,
				SUM(CASE WHEN confirmed_at IS NULL THEN 1 ELSE 0 END) AS pending
			FROM series_subscriptions GROUP BY series_tag`
		)
		.all();
	return new Map(
		results.map((r) => [
			String(r.series_tag),
			{ confirmed: Number(r.confirmed ?? 0), pending: Number(r.pending ?? 0) }
		])
	);
}

/**
 * Borra los pedidos sin confirmar que vencieron (los corre el cron).
 *
 * @param {D1Database} db
 * @param {number} [now]
 */
export async function deleteExpiredPending(db, now = Date.now()) {
	const r = await db
		.prepare(
			'DELETE FROM series_subscriptions WHERE confirmed_at IS NULL AND confirm_expires_at <= ?1'
		)
		.bind(now)
		.run();
	return Number(r.meta?.changes ?? 0);
}

/**
 * «Avisame si se repite» sobre «Lo que sigo» (decisión 0025, docs/lo-que-sigo.md). Con el
 * interruptor `lo_que_sigo` prendido:
 *
 * - **con cuenta**, «Avisame» es seguir la etiqueta de la serie con «mail cuando se anuncia algo
 *   nuevo» (y «en mi calendario»); darse de baja apaga ese mail (lo seguido queda);
 * - las suscripciones con cuenta que ya existían en `series_subscriptions` pasan a `follows` en el
 *   cron (`migrateAccountSubscriptions`), guardando su id en `follows.series_subscription_id`: así
 *   el link de baja de los mails que ya salieron (/avisos/baja/<id>.<firma>) sigue andando;
 * - **sin cuenta** no cambia nada: mail con doble confirmación en `series_subscriptions` y los
 *   avisos de siempre ($lib/server/series/notify.js).
 *
 * Con `lo_que_sigo` apagado todo queda como antes (y lo ya pasado a `follows` no recibe mails
 * hasta que se vuelva a prender: el cron de «Lo que sigo» solo corre prendido).
 */
import { isFlagOn } from '$lib/server/flags.js';
import { follow } from './follows.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Lo que queda prendido al pedir «Avisame» con cuenta. */
const AVISAME_OPTIONS = Object.freeze({ calendario: true, mail_nuevo: true, recordatorio: false });

/**
 * ¿«Avisame» con cuenta va por «Lo que sigo»? (su interruptor).
 *
 * @param {D1Database} db
 */
export async function avisameViaSigo(db) {
	return isFlagOn(db, 'lo_que_sigo');
}

/**
 * «Avisame» con cuenta: sigue la etiqueta de la serie con mail de lo nuevo. Si ya la seguía,
 * prende ese mail y deja lo demás como estaba.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} seriesTag
 * @param {{ now?: number }} [opts]
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string }>}
 */
export async function followSeriesByMail(db, accountId, seriesTag, { now = Date.now() } = {}) {
	const target = { kind: /** @type {const} */ ('etiqueta'), key: seriesTag };
	const r = await follow(db, accountId, target, { options: AVISAME_OPTIONS, now });
	if (!r.ok) return r;
	if (!r.created) {
		await db
			.prepare(
				`UPDATE follows SET mail_new = 1, updated_at = ?3
				WHERE account_id = ?1 AND target_kind = 'etiqueta' AND target_key = ?2`
			)
			.bind(accountId, seriesTag, now)
			.run();
	}
	return { ok: true };
}

/**
 * Baja de «Avisame» con cuenta: apaga el mail de lo nuevo de esa etiqueta (la sigue igual).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {string} seriesTag
 * @param {{ now?: number }} [opts]
 */
export async function stopSeriesMail(db, accountId, seriesTag, { now = Date.now() } = {}) {
	await db
		.prepare(
			`UPDATE follows SET mail_new = 0, updated_at = ?3
			WHERE account_id = ?1 AND target_kind = 'etiqueta' AND target_key = ?2`
		)
		.bind(accountId, seriesTag, now)
		.run();
}

/**
 * Las etiquetas que la cuenta sigue con mail de lo nuevo (lo que «Avisame» muestra como
 * suscripto).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<string[]>}
 */
export async function mailFollowedTags(db, accountId) {
	const { results } = await db
		.prepare(
			`SELECT target_key FROM follows
			WHERE account_id = ?1 AND target_kind = 'etiqueta' AND mail_new = 1 ORDER BY target_key`
		)
		.bind(accountId)
		.all();
	return results.map((r) => String(r.target_key));
}

/**
 * El link de baja de un aviso viejo (/avisos/baja/<id>.<firma>) cuando la suscripción ya pasó a
 * `follows`: apaga el mail de lo nuevo y devuelve la etiqueta, o `null` si no hay ninguna.
 *
 * @param {D1Database} db
 * @param {string} subscriptionId
 * @param {{ now?: number, dryRun?: boolean }} [opts] `dryRun`: solo dice la etiqueta
 * @returns {Promise<string | null>}
 */
export async function followForSubscription(
	db,
	subscriptionId,
	{ now = Date.now(), dryRun = false } = {}
) {
	const row = dryRun
		? await db
				.prepare('SELECT target_key FROM follows WHERE series_subscription_id = ?1')
				.bind(subscriptionId)
				.first()
		: await db
				.prepare(
					`UPDATE follows SET mail_new = 0, updated_at = ?2
					WHERE series_subscription_id = ?1 RETURNING target_key`
				)
				.bind(subscriptionId, now)
				.first();
	return row ? String(row.target_key) : null;
}

/**
 * Pasa las suscripciones confirmadas con cuenta de `series_subscriptions` a `follows` (lo corre
 * el cron de «Lo que sigo», en tandas). Cada una queda como seguir la etiqueta con mail de lo
 * nuevo, `created_at` = cuándo se confirmó (así no le llega como nuevo lo que ya estaba
 * anunciado) y su id en `series_subscription_id`. Si la cuenta ya seguía la etiqueta, solo le
 * prende el mail. La fila vieja se borra en la misma tanda (con sus `series_notifications`), así
 * el aviso viejo deja de mandarle y no le llegan dos.
 *
 * Con `accountId`, solo las de esa cuenta: Mi rincón → Lo que sigo lo corre al abrirse, así lo
 * que la cuenta pidió antes de prender «Lo que sigo» aparece en su lista sin esperar al cron.
 *
 * @param {D1Database} db
 * @param {{ now?: number, limit?: number, accountId?: string }} [opts]
 * @returns {Promise<number>} cuántas pasó
 */
export async function migrateAccountSubscriptions(
	db,
	{ now = Date.now(), limit = 100, accountId } = {}
) {
	const { results } = await db
		.prepare(
			`SELECT s.id, s.account_id, s.series_tag, s.confirmed_at FROM series_subscriptions s
			JOIN accounts a ON a.id = s.account_id AND a.deleted_at IS NULL
			WHERE s.account_id IS NOT NULL AND s.confirmed_at IS NOT NULL
			AND (?2 IS NULL OR s.account_id = ?2)
			ORDER BY s.confirmed_at LIMIT ?1`
		)
		.bind(limit, accountId ?? null)
		.all();
	let moved = 0;
	for (const r of results) {
		await db.batch([
			db
				.prepare(
					`INSERT INTO follows (account_id, target_kind, target_key, in_calendar, mail_new,
						mail_reminder, series_subscription_id, created_at, updated_at)
					VALUES (?1, 'etiqueta', ?2, 1, 1, 0, ?3, ?4, ?5)
					ON CONFLICT (account_id, target_kind, target_key) DO UPDATE SET mail_new = 1,
						series_subscription_id = COALESCE(follows.series_subscription_id, excluded.series_subscription_id),
						updated_at = excluded.updated_at`
				)
				.bind(r.account_id, r.series_tag, r.id, Number(r.confirmed_at), now),
			db.prepare('DELETE FROM series_subscriptions WHERE id = ?1').bind(r.id)
		]);
		moved++;
	}
	return moved;
}

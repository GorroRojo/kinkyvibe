/**
 * Los mails de «Lo que sigo» (docs/lo-que-sigo.md): «se anunció algo nuevo» y «recordatorio el
 * día antes». Los corre el cron de mails cada 15 minutos (POST /api/cron/recordatorios) con los
 * interruptores `lo_que_sigo` y `cuentas` prendidos. Cada corrida:
 *
 * 1. anota en `follow_events_seen` los eventos próximos (listados, con fecha futura, no
 *    cancelados) que todavía no había visto. La primera corrida de todas los anota con fecha 0:
 *    lo que ya estaba anunciado cuando se prendió no le llega a nadie como nuevo;
 * 2. pasa las suscripciones con cuenta de «Avisame si se repite» a `follows` (avisame.js);
 * 3. por cada cuenta con algún mail prendido, busca los eventos de lo que sigue (los mismos que
 *    el calendario, `eventsForFollow`) y le manda, como mucho una vez por evento y tipo:
 *    - **nuevo**: si sigue algo con «mail cuando se anuncia algo nuevo» desde antes de que se
 *      viera el evento;
 *    - **recordatorio**: si sigue algo con «recordatorio el día antes» y el evento empieza en
 *      las próximas 24 horas.
 *    La fila de `follow_notifications` se toma antes de mandar y se suelta si el mail falla (se
 *    reintenta en la próxima). Resend recibe además una clave de idempotencia.
 *
 * El mail va al de la cuenta; no dice nada de otras cuentas. Lleva el link para apagar todos los
 * mails de «Lo que sigo» (sin entrar) y el de Mi rincón → Lo que sigo.
 */
import { signLink, verifyLink } from '$lib/server/signedLinks.js';
import { eventsForFollow } from './calendar.js';
import { stopAllMail } from './follows.js';
import { migrateAccountSubscriptions } from './avisame.js';
import { buildFollowEmail } from './email.js';
import { resolveTarget } from './targets.js';
import { optionsFromRow } from '$lib/utils/sigo.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {Pick<ProcessedPost, 'meta' | 'path'>} Post */
/** @typedef {(to: string, message: import('./email.js').Message, idempotencyKey: string) => Promise<'sent' | 'simulated' | 'failed'>} FollowSend */

/** Mails por corrida, como mucho (el resto sale en las siguientes). */
export const FOLLOW_NOTIFY_BATCH = 50;

/** Cuánto antes del evento sale el recordatorio, como mucho. */
export const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** La clave de los links firmados (propia: cada uso tiene la suya, $lib/server/signedLinks.js). */
const UNSUBSCRIBE_KEY = 'sigo_mail_stop_key';

/**
 * Link para apagar todos los mails de «Lo que sigo» de una cuenta: `<origin>/avisos/sigo/<id>.<firma>`.
 *
 * @param {D1Database} db
 * @param {string} origin
 * @param {string} accountId
 */
export async function stopMailUrl(db, origin, accountId) {
	return `${origin}/avisos/sigo/${accountId}.${await signLink(db, UNSUBSCRIBE_KEY, `sigo:${accountId}`)}`;
}

/**
 * ¿El link es válido? Devuelve la cuenta o `null`.
 *
 * @param {D1Database} db
 * @param {unknown} token `<cuenta>.<firma>`
 */
export async function checkStopMailToken(db, token) {
	if (typeof token !== 'string') return null;
	const m = token.match(/^([0-9a-f-]{36})\.([A-Za-z0-9_-]{32})$/);
	if (!m) return null;
	return (await verifyLink(db, UNSUBSCRIBE_KEY, `sigo:${m[1]}`, m[2])) ? m[1] : null;
}

/**
 * Apaga todos los mails de «Lo que sigo» con el link del mail. `null` si el link no vale.
 *
 * @param {D1Database} db
 * @param {unknown} token
 * @param {{ now?: number }} [opts]
 */
export async function stopMailWithToken(db, token, { now = Date.now() } = {}) {
	const accountId = await checkStopMailToken(db, token);
	if (!accountId) return null;
	await stopAllMail(db, accountId, { now });
	return accountId;
}

/**
 * Los eventos próximos de este deploy: listados, de calendario, con fecha futura y no cancelados.
 *
 * @param {readonly Post[]} posts
 * @param {number} now
 */
export function upcomingEvents(posts, now) {
	return posts.filter((p) => {
		if (p.meta?.category !== 'calendario' || p.meta.status === 'cancelado') return false;
		const t = new Date(p.meta.start).getTime();
		return Number.isFinite(t) && t > now;
	});
}

/**
 * Anota los eventos como vistos. La primera vez (tabla vacía) con fecha 0.
 *
 * @param {D1Database} db
 * @param {readonly string[]} slugs
 * @param {number} now
 */
export async function markEventsSeen(db, slugs, now) {
	if (!slugs.length) return 0;
	const any = await db.prepare('SELECT 1 FROM follow_events_seen LIMIT 1').first();
	const at = any ? now : 0;
	const results = await db.batch(
		slugs.map((slug) =>
			db
				.prepare(
					`INSERT INTO follow_events_seen (event_slug, first_seen_at) VALUES (?1, ?2)
					ON CONFLICT DO NOTHING`
				)
				.bind(slug, at)
		)
	);
	return results.reduce((n, r) => n + Number(r.meta?.changes ?? 0), 0);
}

/**
 * @param {{ db: D1Database, posts: readonly Post[], tags: TagManager, origin: string,
 *   send: FollowSend, now?: number, limit?: number }} input
 * @returns {Promise<{ seen: number, migrated: number, sent: number, failed: number }>}
 */
export async function runFollowNotifications({
	db,
	posts,
	tags,
	origin,
	send,
	now = Date.now(),
	limit = FOLLOW_NOTIFY_BATCH
}) {
	const events = upcomingEvents(posts, now);
	const seen = await markEventsSeen(
		db,
		events.map((p) => String(p.meta.postID)),
		now
	);
	const migrated = await migrateAccountSubscriptions(db, { now });
	if (!events.length) return { seen, migrated, sent: 0, failed: 0 };

	const keys = JSON.stringify(events.map((p) => String(p.meta.postID)));
	const { results: seenRows } = await db
		.prepare(
			`SELECT event_slug, first_seen_at FROM follow_events_seen
			WHERE event_slug IN (SELECT value FROM json_each(?1))`
		)
		.bind(keys)
		.all();
	const firstSeen = new Map(seenRows.map((r) => [String(r.event_slug), Number(r.first_seen_at)]));
	const { results: sentRows } = await db
		.prepare(
			`SELECT account_id, event_slug, kind FROM follow_notifications
			WHERE event_slug IN (SELECT value FROM json_each(?1))`
		)
		.bind(keys)
		.all();
	const already = new Set(
		sentRows.map((r) => `${r.account_id}\u0000${r.event_slug}\u0000${r.kind}`)
	);

	// Las cosas seguidas con algún mail, de cuentas vivas con mail.
	const { results: rows } = await db
		.prepare(
			`SELECT f.*, a.email FROM follows f JOIN accounts a ON a.id = f.account_id
			WHERE (f.mail_new = 1 OR f.mail_reminder = 1)
			AND a.deleted_at IS NULL AND a.email IS NOT NULL
			ORDER BY f.account_id, f.created_at`
		)
		.all();

	/** @type {Map<string, { email: string, items: Map<string, { post: Post, kinds: Set<'nuevo' | 'recordatorio'>, reasons: Set<string> }> }>} */
	const byAccount = new Map();
	let budget = limit;
	for (const row of rows) {
		const accountId = String(row.account_id);
		const options = optionsFromRow(row);
		const target = {
			kind: /** @type {any} */ (String(row.target_kind)),
			key: String(row.target_key)
		};
		const matched = await eventsForFollow(db, accountId, target, events, tags);
		if (!matched.length) continue;
		/** @type {string | null} */
		let reason = null;
		for (const post of matched) {
			const slug = String(post.meta.postID);
			/** @type {('nuevo' | 'recordatorio')[]} */
			const due = [];
			const seenAt = firstSeen.get(slug);
			if (options.mail_nuevo && seenAt !== undefined && Number(row.created_at) < seenAt)
				due.push('nuevo');
			const start = new Date(post.meta.start).getTime();
			if (options.recordatorio && start - now <= REMINDER_WINDOW_MS) due.push('recordatorio');
			const fresh = due.filter((k) => !already.has(`${accountId}\u0000${slug}\u0000${k}`));
			if (!fresh.length) continue;
			reason ??=
				(await resolveTarget({ db, tags, accountId }, target))?.title ?? String(row.target_key);
			let acc = byAccount.get(accountId);
			if (!acc) byAccount.set(accountId, (acc = { email: String(row.email), items: new Map() }));
			let item = acc.items.get(slug);
			if (!item) acc.items.set(slug, (item = { post, kinds: new Set(), reasons: new Set() }));
			fresh.forEach((k) => item.kinds.add(k));
			item.reasons.add(reason);
		}
	}

	let sent = 0;
	let failed = 0;
	for (const [accountId, acc] of byAccount) {
		for (const [slug, item] of acc.items) {
			for (const kind of item.kinds) {
				if (budget <= 0) return { seen, migrated, sent, failed };
				const claim = await db
					.prepare(
						`INSERT INTO follow_notifications (account_id, event_slug, kind, sent_at)
						VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING`
					)
					.bind(accountId, slug, kind, now)
					.run();
				if (Number(claim.meta?.changes ?? 0) !== 1) continue;
				budget--;
				const message = buildFollowEmail({
					kind,
					title: String(item.post.meta.title ?? slug),
					start: String(item.post.meta.start),
					eventUrl: origin + (item.post.path ?? `/calendario/${slug}`),
					reasons: [...item.reasons],
					manageUrl: `${origin}/mi-rincon/sigo`,
					stopUrl: await stopMailUrl(db, origin, accountId)
				});
				/** @type {'sent' | 'simulated' | 'failed'} */
				let result = 'failed';
				try {
					result = await send(acc.email, message, `sigo-${accountId}-${slug}-${kind}`);
				} catch (error) {
					console.error('[sigo] no se pudo mandar un aviso:', error);
				}
				if (result === 'failed') {
					failed++;
					await db
						.prepare(
							`DELETE FROM follow_notifications
							WHERE account_id = ?1 AND event_slug = ?2 AND kind = ?3`
						)
						.bind(accountId, slug, kind)
						.run();
				} else sent++;
			}
		}
	}
	return { seen, migrated, sent, failed };
}

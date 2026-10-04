/**
 * Avisos de edición nueva ("Avisame si se repite"). Lo corre el cron de mails cada 15 minutos
 * (POST /api/cron/recordatorios, ver src/lib/server/scheduled.js), con el interruptor `series`
 * prendido. No hay otro programador.
 *
 * Una edición "se publica" cuando aparece en el deploy (listada, no despublicada) con fecha en el
 * futuro. Cada corrida:
 * 1. anota en `series_editions_seen` las ediciones próximas que todavía no había visto, con la
 *    hora (la primera vez que las ve);
 * 2. borra los pedidos sin confirmar vencidos;
 * 3. a cada suscripción confirmada ANTES de que se viera una edición, que no recibió el aviso de
 *    esa edición, le manda uno. La fila de `series_notifications` se toma antes de mandar (si dos
 *    corridas coinciden, solo una la consigue) y se suelta si el mail falla, así se reintenta en
 *    la próxima. Además, Resend recibe una clave de idempotencia por suscripción y edición.
 *
 * Quien se suscribe cuando la próxima edición ya estaba anunciada no recibe aviso de esa (la
 * página ya se la muestra); sí de las siguientes.
 */
import { seriesEditions, seriesTagIds, splitEditions } from '$lib/utils/series.js';
import { buildNewEditionEmail } from './email.js';
import { deleteExpiredPending, unsubscribeUrl } from './subscriptions.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Avisos por corrida, como mucho (el resto sale en las siguientes). */
export const NOTIFY_BATCH = 50;

/**
 * Anota ediciones como vistas (si no lo estaban). Lo usa el cron y también la suscripción: así
 * una edición que ya estaba anunciada cuando alguien se suscribió no le llega como "nueva".
 * Devuelve cuántas no se habían visto.
 *
 * @param {D1Database} db
 * @param {readonly { series: string, slug: string }[]} editions
 * @param {number} now
 */
export async function markEditionsSeen(db, editions, now) {
	if (!editions.length) return 0;
	const results = await db.batch(
		editions.map((e) =>
			db
				.prepare(
					`INSERT INTO series_editions_seen (series_tag, event_slug, first_seen_at)
					VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING`
				)
				.bind(e.series, e.slug, now)
		)
	);
	return results.reduce((n, r) => n + Number(r.meta?.changes ?? 0), 0);
}

/**
 * @param {{
 *   db: D1Database,
 *   posts: readonly Pick<ProcessedPost, 'meta' | 'path'>[],
 *   tags: TagManager,
 *   origin: string,
 *   send: import('./subscriptions.js').SeriesSend,
 *   now?: number,
 *   limit?: number
 * }} input
 * @returns {Promise<{ seen: number, sent: number, failed: number, expired: number }>}
 */
export async function runSeriesNotifications({
	db,
	posts,
	tags,
	origin,
	send,
	now = Date.now(),
	limit = NOTIFY_BATCH
}) {
	/** @type {Map<string, { series: string, seriesName: string, slug: string, title: string, start: string, path: string }>} */
	const upcoming = new Map();
	for (const id of seriesTagIds(tags)) {
		const seriesName = tags.get(id)?.visible_name ?? id;
		for (const e of splitEditions(seriesEditions(posts, id), now).upcoming) {
			upcoming.set(`${id}\u0000${e.slug}`, {
				series: id,
				seriesName,
				slug: e.slug,
				title: e.title,
				start: e.start,
				path: e.path
			});
		}
	}

	const seen = await markEditionsSeen(db, [...upcoming.values()], now);
	const expired = await deleteExpiredPending(db, now);
	if (!upcoming.size) return { seen, sent: 0, failed: 0, expired };

	// Solo ediciones que siguen siendo próximas en este deploy (una que se canceló o se borró
	// no avisa). Las claves van como JSON para no armar SQL con datos.
	const keys = JSON.stringify([...upcoming.values()].map((e) => [e.series, e.slug]));
	const { results: due } = await db
		.prepare(
			`SELECT s.id, s.series_tag, e.event_slug, COALESCE(s.email, a.email) AS email
			FROM series_editions_seen e
			JOIN json_each(?1) k
				ON json_extract(k.value, '$[0]') = e.series_tag
				AND json_extract(k.value, '$[1]') = e.event_slug
			JOIN series_subscriptions s
				ON s.series_tag = e.series_tag
				AND s.confirmed_at IS NOT NULL
				AND s.confirmed_at < e.first_seen_at
			LEFT JOIN accounts a ON a.id = s.account_id AND a.deleted_at IS NULL
			LEFT JOIN series_notifications n
				ON n.subscription_id = s.id AND n.event_slug = e.event_slug
			WHERE n.subscription_id IS NULL AND COALESCE(s.email, a.email) IS NOT NULL
			ORDER BY e.first_seen_at, s.confirmed_at
			LIMIT ?2`
		)
		.bind(keys, limit)
		.all();

	let sent = 0;
	let failed = 0;
	for (const row of due) {
		const id = String(row.id);
		const slug = String(row.event_slug);
		const edition = upcoming.get(`${row.series_tag}\u0000${slug}`);
		if (!edition) continue;
		const claim = await db
			.prepare(
				`INSERT INTO series_notifications (subscription_id, event_slug, sent_at)
				VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING`
			)
			.bind(id, slug, now)
			.run();
		if (Number(claim.meta?.changes ?? 0) !== 1) continue;
		const message = buildNewEditionEmail({
			seriesName: edition.seriesName,
			title: edition.title,
			start: edition.start,
			eventUrl: origin + edition.path,
			unsubscribeUrl: await unsubscribeUrl(db, origin, id),
			origin
		});
		/** @type {'sent' | 'simulated' | 'failed'} */
		let result = 'failed';
		try {
			result = await send(String(row.email), message, `series-${id}-${slug}`);
		} catch (error) {
			console.error('[series] no se pudo mandar un aviso:', error);
		}
		if (result === 'failed') {
			failed++;
			await db
				.prepare('DELETE FROM series_notifications WHERE subscription_id = ?1 AND event_slug = ?2')
				.bind(id, slug)
				.run();
		} else sent++;
	}
	return { seen, sent, failed, expired };
}

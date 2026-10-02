/**
 * Link de la transmisión de los eventos online. El link NO va en el frontmatter (el repo es
 * público): lo carga une admin en /admin/eventos/<slug> (Resumen) y se guarda en D1
 * (`event_ticket_settings`). Cada entrada de un evento online lleva ese link en lugar de un QR.
 *
 * Envíos: `stream_link_sends` guarda a qué orden se le mandó qué link (por su SHA-256). El mail de
 * las entradas lo registra si ya había link al comprar, y "Enviar el link a todes" solo le escribe
 * a las órdenes aprobadas que todavía no recibieron ESE link: tocarlo dos veces no manda nada de
 * nuevo, y si el link cambia, se manda el nuevo a todes. Se manda en tandas: el botón manda la
 * primera y deja el pedido anotado (`event_ticket_settings.stream_send_hash`); el cron manda el
 * resto (ver sendState.js para los reintentos).
 */

import { sha256Hex } from '$lib/server/hash.js';
import { DEFAULT_MAIL_BATCH_SIZE } from './batchSize.js';
import { STALE_CLAIM_MS, expireStaleClaims, pendingSendSql, sendBatch } from './sendState.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

const MAX_LINK_LENGTH = 500;

/**
 * Valida el link que carga une admin: `https://…` (o vacío para borrarlo).
 *
 * @param {unknown} raw
 * @returns {{ ok: true, link: string | null } | { ok: false, message: string }}
 */
export function normalizeStreamLink(raw) {
	const s = typeof raw === 'string' ? raw.trim() : '';
	if (!s) return { ok: true, link: null };
	if (s.length > MAX_LINK_LENGTH) {
		return { ok: false, message: `El link es demasiado largo (hasta ${MAX_LINK_LENGTH}).` };
	}
	/** @type {URL} */
	let url;
	try {
		url = new URL(s);
	} catch {
		return { ok: false, message: 'Pegá el link completo, empezando con https://' };
	}
	if (url.protocol !== 'https:' || !url.hostname.includes('.')) {
		return { ok: false, message: 'El link tiene que empezar con https://' };
	}
	return { ok: true, link: url.href };
}

/** Cómo se guarda un link en `stream_link_sends`. */
export const streamLinkHash = sha256Hex;

/**
 * @param {D1Database} db
 * @param {string} eventSlug
 * @returns {Promise<{ link: string, updatedAt: number | null, updatedBy: string | null } | null>}
 */
export async function getStreamLink(db, eventSlug) {
	const row = await db
		.prepare(
			'SELECT stream_link, stream_link_updated_at, updated_by FROM event_ticket_settings WHERE event_slug = ?1'
		)
		.bind(eventSlug)
		.first();
	if (!row?.stream_link) return null;
	return {
		link: String(row.stream_link),
		updatedAt: row.stream_link_updated_at === null ? null : Number(row.stream_link_updated_at),
		updatedBy: row.updated_by === null ? null : String(row.updated_by)
	};
}

/**
 * Guarda (o borra, con `null`) el link de un evento.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, link: string | null, by: string, now?: number }} input
 */
export async function setStreamLink(db, { eventSlug, link, by, now = Date.now() }) {
	await db
		.prepare(
			`INSERT INTO event_ticket_settings (event_slug, stream_link, stream_link_updated_at, updated_by)
			VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (event_slug) DO UPDATE SET stream_link = ?2, stream_link_updated_at = ?3,
				updated_by = ?4`
		)
		.bind(eventSlug, link, now, by)
		.run();
}

/**
 * Órdenes aprobadas del evento que todavía no recibieron este link. Sin `includeFailed`, las
 * que ya fallaron {@link import('./sendState.js').MAX_ATTEMPTS} veces no cuentan (el cron no las
 * reintenta solo); con `includeFailed` sí (el botón "Enviar el link a todes" las reintenta).
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} link
 * @param {{ now?: number, includeFailed?: boolean }} [options]
 * @returns {Promise<import('./orders.js').Order[]>}
 */
export async function streamLinkRecipients(
	db,
	eventSlug,
	link,
	{ now = Date.now(), includeFailed = false } = {}
) {
	const hash = await streamLinkHash(link);
	const { results } = await db
		.prepare(
			`SELECT o.* FROM orders o WHERE o.event_slug = ?1 AND o.status = 'approved'
				AND ${pendingSendSql('stream_link_sends', { key: 2, stale: 3, includeFailed })}
			ORDER BY o.created_at`
		)
		.bind(eventSlug, hash, now - STALE_CLAIM_MS)
		.all();
	return /** @type {import('./orders.js').Order[]} */ (results);
}

/**
 * Registra que a una orden ya se le mandó este link (lo usa el mail de las entradas, que lo
 * lleva adentro). Devuelve `false` si ya estaba registrado o reservado: sirve de "reserva"
 * antes de mandar, para no mandarlo dos veces.
 *
 * @param {D1Database} db
 * @param {{ orderId: string, link: string, now?: number }} input
 */
export async function claimStreamLinkSend(db, { orderId, link, now = Date.now() }) {
	const res = await db
		.prepare(
			'INSERT OR IGNORE INTO stream_link_sends (order_id, link_hash, sent_at) VALUES (?1, ?2, ?3)'
		)
		.bind(orderId, await streamLinkHash(link), now)
		.run();
	return res.meta.changes === 1;
}

/**
 * Deshace el registro de un mail de entradas que falló (así "Enviar el link a todes" lo manda).
 *
 * @param {D1Database} db
 * @param {{ orderId: string, link: string }} input
 */
export async function releaseStreamLinkSend(db, { orderId, link }) {
	await db
		.prepare('DELETE FROM stream_link_sends WHERE order_id = ?1 AND link_hash = ?2')
		.bind(orderId, await streamLinkHash(link))
		.run();
}

/**
 * "Enviar el link a todes": deja pedido el envío de este link (el cron sigue mandando tandas
 * hasta terminar) y vuelve a la cola a quienes ya habían fallado todos sus intentos.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, link: string, now?: number }} input
 */
export async function requestStreamLinkSend(db, { eventSlug, link, now = Date.now() }) {
	const hash = await streamLinkHash(link);
	await db.batch([
		db
			.prepare(
				`UPDATE event_ticket_settings SET stream_send_hash = ?2, stream_send_requested_at = ?3
				WHERE event_slug = ?1`
			)
			.bind(eventSlug, hash, now),
		db
			.prepare(
				`UPDATE stream_link_sends SET status = 'retry', attempts = 0
				WHERE link_hash = ?2 AND status = 'failed'
					AND order_id IN (SELECT id FROM orders WHERE event_slug = ?1)`
			)
			.bind(eventSlug, hash)
	]);
}

/**
 * Eventos con un "Enviar el link a todes" sin terminar, con su link actual. Si el link cambió
 * (o se borró) desde que se pidió, el pedido viejo se descarta.
 *
 * @param {D1Database} db
 * @returns {Promise<{ eventSlug: string, link: string }[]>}
 */
export async function pendingStreamLinkRequests(db) {
	const { results } = await db
		.prepare(
			`SELECT event_slug, stream_link, stream_send_hash FROM event_ticket_settings
			WHERE stream_send_hash IS NOT NULL ORDER BY stream_send_requested_at`
		)
		.all();
	const out = [];
	for (const r of results) {
		const eventSlug = String(r.event_slug);
		const link = r.stream_link ? String(r.stream_link) : '';
		if (link && (await streamLinkHash(link)) === r.stream_send_hash) {
			out.push({ eventSlug, link });
		} else {
			await clearStreamLinkRequest(db, eventSlug, String(r.stream_send_hash));
		}
	}
	return out;
}

/**
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} hash solo si el pedido sigue siendo de este link
 */
async function clearStreamLinkRequest(db, eventSlug, hash) {
	await db
		.prepare(
			`UPDATE event_ticket_settings SET stream_send_hash = NULL, stream_send_requested_at = NULL
			WHERE event_slug = ?1 AND stream_send_hash = ?2`
		)
		.bind(eventSlug, hash)
		.run();
}

/**
 * Manda una tanda del link: como mucho `limit` mails a órdenes aprobadas que todavía no lo
 * recibieron. Idempotente por valor del link (ver sendState.js). Cuando ya no queda nadie
 * (salvo quienes fallaron todos sus intentos), el pedido del evento se da por terminado.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   link: string,
 *   send: (order: import('./orders.js').Order) => Promise<boolean>,
 *   limit?: number,
 *   now?: number
 * }} input
 * @returns {Promise<{ sent: number, failed: number, remaining: number, gaveUp: number }>}
 *   `remaining`: quienes siguen en la cola (incluye los que fallaron y se reintentan);
 *   `gaveUp`: quienes fallaron todos los intentos.
 */
export async function sendStreamLinkBatch(
	db,
	{ eventSlug, link, send, limit = DEFAULT_MAIL_BATCH_SIZE, now = Date.now() }
) {
	await expireStaleClaims(db, 'stream_link_sends', now);
	const hash = await streamLinkHash(link);
	const items = await streamLinkRecipients(db, eventSlug, link, { now });
	const r = await sendBatch(db, 'stream_link_sends', {
		items,
		limit,
		now,
		label: 'el link',
		claim: (order) => ({ orderId: order.id, key: hash }),
		send
	});
	const remaining = (await streamLinkRecipients(db, eventSlug, link, { now })).length;
	if (remaining === 0) await clearStreamLinkRequest(db, eventSlug, hash);
	const gaveUp =
		(await streamLinkRecipients(db, eventSlug, link, { now, includeFailed: true })).length -
		remaining;
	return { sent: r.sent, failed: r.failed, remaining, gaveUp };
}

/**
 * Órdenes aprobadas a las que el link ACTUAL de su evento no les llegó después de todos los
 * intentos ('failed'), por evento.
 *
 * @param {D1Database} db
 * @param {string[]} slugs
 * @returns {Promise<Map<string, number>>}
 */
export async function failedStreamLinkCounts(db, slugs) {
	if (!slugs.length) return new Map();
	const [links, counts] =
		/** @type {import('@cloudflare/workers-types').D1Result<Record<string, unknown>>[]} */ (
			await db.batch(failedStreamLinkStatements(db, slugs))
		);
	return readFailedStreamLinkCounts(links.results, counts.results);
}

/**
 * Las consultas de {@link failedStreamLinkCounts} (para correrlas en una tanda; `slugs` no
 * vacío): el link actual de cada evento y los envíos fallidos por evento y por link. Cuál es el
 * link actual (su hash) se elige después, en {@link readFailedStreamLinkCounts}.
 *
 * @param {D1Database} db
 * @param {string[]} slugs
 */
export function failedStreamLinkStatements(db, slugs) {
	const list = slugs.map((_, i) => `?${i + 1}`).join(', ');
	return [
		db
			.prepare(
				`SELECT event_slug, stream_link FROM event_ticket_settings
				WHERE stream_link IS NOT NULL AND stream_link != ''
					AND event_slug IN (${list})`
			)
			.bind(...slugs),
		db
			.prepare(
				`SELECT o.event_slug, s.link_hash, COUNT(*) AS n FROM stream_link_sends s
				JOIN orders o ON o.id = s.order_id
				WHERE s.status = 'failed' AND o.status = 'approved' AND o.event_slug IN (${list})
				GROUP BY o.event_slug, s.link_hash`
			)
			.bind(...slugs)
	];
}

/**
 * @param {Record<string, unknown>[]} links el link actual de cada evento
 * @param {Record<string, unknown>[]} counts los envíos fallidos por evento y link
 * @returns {Promise<Map<string, number>>}
 */
export async function readFailedStreamLinkCounts(links, counts) {
	/** @type {Map<string, number>} */
	const failed = new Map();
	for (const r of counts) failed.set(`${r.event_slug}\n${r.link_hash}`, Number(r.n ?? 0));
	/** @type {Map<string, number>} */
	const out = new Map();
	for (const r of links) {
		const slug = String(r.event_slug);
		const n = failed.get(`${slug}\n${await streamLinkHash(String(r.stream_link))}`) ?? 0;
		if (n) out.set(slug, n);
	}
	return out;
}

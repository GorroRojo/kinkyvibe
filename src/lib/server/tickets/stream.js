/**
 * Link de la transmisión de los eventos online. El link NO va en el frontmatter (el repo es
 * público): lo carga une admin en /admin/eventos/<slug> (Resumen) y se guarda en D1
 * (`event_ticket_settings`). Cada entrada de un evento online lleva ese link en lugar de un QR.
 *
 * Envíos: `stream_link_sends` guarda a qué orden se le mandó qué link (por su SHA-256). El mail de
 * las entradas lo registra si ya había link al comprar, y "Enviar el link a todes" solo le escribe
 * a las órdenes aprobadas que todavía no recibieron ESE link: tocarlo dos veces no manda nada de
 * nuevo, y si el link cambia, se manda el nuevo a todes.
 */

import { sha256Hex } from '$lib/server/hash.js';

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
 * Órdenes aprobadas del evento que todavía no recibieron este link.
 *
 * @param {D1Database} db
 * @param {string} eventSlug
 * @param {string} link
 * @returns {Promise<import('./orders.js').Order[]>}
 */
export async function streamLinkRecipients(db, eventSlug, link) {
	const hash = await streamLinkHash(link);
	const { results } = await db
		.prepare(
			`SELECT o.* FROM orders o WHERE o.event_slug = ?1 AND o.status = 'approved'
				AND NOT EXISTS (SELECT 1 FROM stream_link_sends s WHERE s.order_id = o.id AND s.link_hash = ?2)
			ORDER BY o.created_at`
		)
		.bind(eventSlug, hash)
		.all();
	return /** @type {import('./orders.js').Order[]} */ (results);
}

/**
 * Registra que a una orden ya se le mandó este link. Devuelve `false` si ya estaba registrado
 * (otro envío ganó): sirve de "reserva" antes de mandar, para no mandar dos veces aunque dos
 * admins toquen el botón a la vez.
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
 * Deshace el registro de un envío que falló (así el próximo "Enviar el link a todes" lo reintenta).
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
 * Manda el link a todas las órdenes aprobadas que todavía no lo recibieron. Idempotente por
 * valor del link: repetirlo no manda nada a quien ya lo tiene.
 *
 * @param {D1Database} db
 * @param {{
 *   eventSlug: string,
 *   link: string,
 *   send: (order: import('./orders.js').Order) => Promise<boolean>,
 *   now?: number
 * }} input
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export async function sendStreamLinkToAll(db, { eventSlug, link, send, now = Date.now() }) {
	let sent = 0;
	let failed = 0;
	for (const order of await streamLinkRecipients(db, eventSlug, link)) {
		if (!(await claimStreamLinkSend(db, { orderId: order.id, link, now }))) continue;
		let ok = false;
		try {
			ok = await send(order);
		} catch (error) {
			console.error(`[tickets] no se pudo mandar el link a la orden ${order.id}:`, error);
		}
		if (ok) sent++;
		else {
			failed++;
			await releaseStreamLinkSend(db, { orderId: order.id, link });
		}
	}
	return { sent, failed };
}

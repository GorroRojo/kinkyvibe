/**
 * «Con la entrada abierta ahora» (docs/tickets.md, «Entrada abierta»; gorrite, Mesa, 22/11): la
 * página de una entrada (`/entradas/t/<token>`) avisa más o menos una vez por minuto, mientras está
 * abierta y a la vista, y la Puerta lista a quienes la tienen abierta (probablemente están por
 * llegar).
 *
 * - Solo se guarda la última vez (`tickets.last_seen_at`, migración 0086): ni el celu, ni la IP,
 *   ni cada aviso.
 * - Se escribe solo con una entrada válida (compra aprobada), sin ingreso marcado, de un evento
 *   presencial y dentro de su ventana (desde las 00:00 del día del evento hasta el fin del día en
 *   que termina más 6 horas, como el link de puerta), y como mucho una vez por minuto por entrada.
 * - «Abierta ahora» es haberla visto en los últimos 5 minutos.
 * - Se borra después del evento: `clearPresenceAfterEvents`, en el cron de cada 15 minutos.
 *
 * Si la base todavía no tiene la columna (la migración se aplica antes del merge, decisión 0028),
 * quien llama atrapa el error y sigue sin la sección.
 */
import { arClock, arMidnight } from '$lib/utils/dates.js';
import { toTime } from './config.js';
import { defaultDoorLinkExpiry } from './doorLinks.js';
import { getEventTickets } from './events.js';
import { isValidToken } from './orders.js';

/** «Abierta ahora»: vista en los últimos 5 minutos. */
export const OPEN_NOW_MS = 5 * 60 * 1000;

/**
 * Entre dos escrituras de la misma entrada, al menos esto (la página avisa cada minuto; con un poco
 * de margen para que un aviso que llega antes de tiempo no se saltee).
 */
export const PRESENCE_MIN_GAP_MS = 50 * 1000;

/** Cada cuánto avisa la página de la entrada mientras está a la vista. */
export const PRESENCE_PING_MS = 60 * 1000;

/** Un valor más viejo que esto se borra siempre, aunque el evento siga (no sirve para nada). */
const STALE_MS = 24 * 60 * 60 * 1000;

/**
 * La ventana en que se guarda: desde las 00:00 (Argentina) del día en que empieza el evento hasta
 * el fin del día en que termina más 6 horas (`defaultDoorLinkExpiry`). `null` si no hay ventana:
 * sin evento, online o sin fecha.
 *
 * @param {{ start?: unknown, end?: unknown, online?: boolean } | null | undefined} config
 * @returns {{ from: number, to: number } | null}
 */
export function presenceWindow(config) {
	if (!config || config.online) return null;
	const start = toTime(config.start);
	if (start === null) return null;
	const day = arClock(start);
	return {
		from: arMidnight(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
		to: defaultDoorLinkExpiry(config)
	};
}

/**
 * @param {{ start?: unknown, end?: unknown, online?: boolean } | null | undefined} config
 * @param {number} now
 */
export function inPresenceWindow(config, now) {
	const w = presenceWindow(config);
	return Boolean(w && now >= w.from && now <= w.to);
}

/**
 * Anota que la página de la entrada está abierta. Una lectura chica (y la del evento solo si toca
 * escribir) y una escritura condicional, que no escribe si ya hay un valor de hace menos de
 * `PRESENCE_MIN_GAP_MS` (dos avisos a la vez escriben una sola vez).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ token: string, now?: number,
 *   configFor?: (slug: string) => Promise<{ start?: unknown, end?: unknown, online?: boolean } | null> }} input
 * @returns {Promise<'ok' | 'recent' | 'not-found' | 'void' | 'used' | 'closed'>}
 */
export async function touchTicketPresence(
	db,
	{ token, now = Date.now(), configFor = getEventTickets }
) {
	if (!isValidToken(token)) return 'not-found';
	const row =
		/** @type {{ event_slug: string, checked_in_at: number | null,
		 *   last_seen_at: number | null, status: string } | null} */ (
			await db
				.prepare(
					`SELECT t.event_slug, t.checked_in_at, t.last_seen_at, o.status
				FROM tickets t JOIN orders o ON o.id = t.order_id WHERE t.token = ?1`
				)
				.bind(token)
				.first()
		);
	if (!row) return 'not-found';
	if (row.status !== 'approved') return 'void';
	if (row.checked_in_at) return 'used';
	const last = row.last_seen_at === null ? null : Number(row.last_seen_at);
	if (last !== null && last > now - PRESENCE_MIN_GAP_MS) return 'recent';
	if (!inPresenceWindow(await configFor(row.event_slug), now)) return 'closed';
	const r = await db
		.prepare(
			`UPDATE tickets SET last_seen_at = ?2
			WHERE token = ?1 AND checked_in_at IS NULL
				AND (last_seen_at IS NULL OR last_seen_at <= ?3)`
		)
		.bind(token, now, now - PRESENCE_MIN_GAP_MS)
		.run();
	return r.meta.changes ? 'ok' : 'recent';
}

/**
 * Las entradas del evento vistas en los últimos `OPEN_NOW_MS`: id → cuándo.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {number} [now]
 * @returns {Promise<Map<string, number>>}
 */
export async function seenNow(db, slug, now = Date.now()) {
	const { results } = await db
		.prepare('SELECT id, last_seen_at FROM tickets WHERE event_slug = ?1 AND last_seen_at >= ?2')
		.bind(slug, now - OPEN_NOW_MS)
		.all();
	return new Map(results.map((r) => [String(r.id), Number(r.last_seen_at)]));
}

/**
 * Lo que muestra la Puerta: de la lista del evento, las entradas válidas sin ingreso marcado que
 * están en `seen`, la más reciente primero.
 *
 * @param {readonly { ticketId: string, holder: string, type: string, at: number | null,
 *   valid: boolean }[]} rows
 * @param {Map<string, number>} seen
 * @returns {{ ticketId: string, holder: string, type: string, seenAt: number }[]}
 */
export function openNowList(rows, seen) {
	if (!seen.size) return [];
	return rows
		.filter((r) => r.valid && !r.at && seen.has(r.ticketId))
		.map((r) => ({
			ticketId: r.ticketId,
			holder: r.holder,
			type: r.type,
			seenAt: /** @type {number} */ (seen.get(r.ticketId))
		}))
		.sort((a, b) => b.seenAt - a.seenAt);
}

/**
 * Borra la última vez de las entradas de los eventos que ya terminaron (pasada su ventana, o sin
 * evento) y cualquier valor de más de un día. Si no se puede leer un evento, lo deja para la
 * corrida siguiente.
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {{ now?: number,
 *   configFor?: (slug: string) => Promise<{ start?: unknown, end?: unknown, online?: boolean } | null> }} [options]
 * @returns {Promise<number>} cuántas entradas borró
 */
export async function clearPresenceAfterEvents(
	db,
	{ now = Date.now(), configFor = getEventTickets } = {}
) {
	const stale = await db
		.prepare(
			'UPDATE tickets SET last_seen_at = NULL WHERE last_seen_at IS NOT NULL AND last_seen_at < ?1'
		)
		.bind(now - STALE_MS)
		.run();
	let cleared = stale.meta.changes ?? 0;
	const { results } = await db
		.prepare('SELECT DISTINCT event_slug FROM tickets WHERE last_seen_at IS NOT NULL')
		.all();
	for (const { event_slug: slug } of results) {
		let config;
		try {
			config = await configFor(String(slug));
		} catch {
			continue;
		}
		const w = presenceWindow(config);
		if (w && now <= w.to) continue;
		const r = await db
			.prepare(
				'UPDATE tickets SET last_seen_at = NULL WHERE event_slug = ?1 AND last_seen_at IS NOT NULL'
			)
			.bind(slug)
			.run();
		cleared += r.meta.changes ?? 0;
	}
	return cleared;
}

/**
 * Estado de cada envío masivo por orden (recordatorios y link de la transmisión), para mandar en
 * tandas sin duplicar: ver migrations/0011_send_batches.sql.
 *
 * - Antes de mandar, la orden se reserva con un INSERT/UPDATE atómico ({@link claimSend}): dos
 *   corridas del cron a la vez (o dos admins) nunca le mandan dos veces a la misma orden.
 * - Después se marca 'sent', o 'retry' si falló (la próxima tanda lo reintenta), o 'failed' si ya
 *   se intentó {@link MAX_ATTEMPTS} veces: ahí deja de reintentarse solo y aparece en
 *   "Para revisar".
 * - Una reserva 'sending' de más de {@link STALE_CLAIM_MS} es de un Worker que se cortó a la
 *   mitad: se puede volver a reservar (cuenta como otro intento). El mail en sí lleva una clave
 *   de idempotencia de Resend, así que si sí había salido no se duplica.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Intentos por orden antes de dejarlo como 'failed'. */
export const MAX_ATTEMPTS = 3;
/** Una reserva "mandando" más vieja que esto se considera cortada. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

/** Tablas de envíos y su segunda columna de la clave (con `order_id`). */
const TABLES = /** @type {const} */ ({
	reminder_sends: 'reminder_id',
	stream_link_sends: 'link_hash'
});

/** @typedef {keyof typeof TABLES} SendTable */

/** @param {SendTable} table */
function keyColumn(table) {
	const col = TABLES[table];
	if (!col) throw new Error(`tabla de envíos desconocida: ${table}`);
	return col;
}

/**
 * Condición SQL "a esta orden todavía le falta este envío" (para un `WHERE` sobre `orders o`):
 * no hay fila, o falló y se reintenta, o quedó colgada. Los parámetros `?{key}` (valor de la
 * clave) y `?{stale}` (now − {@link STALE_CLAIM_MS}) los pone quien la usa.
 *
 * @param {SendTable} table
 * @param {{ key: number, stale: number, includeFailed?: boolean }} params números de parámetro
 */
export function pendingSendSql(table, { key, stale, includeFailed = false }) {
	const done = includeFailed ? "s.status = 'sent'" : "s.status IN ('sent', 'failed')";
	return `NOT EXISTS (SELECT 1 FROM ${table} s WHERE s.order_id = o.id AND s.${keyColumn(table)} = ?${key}
		AND (${done} OR (s.status = 'sending' AND s.sent_at >= ?${stale})))`;
}

/**
 * Reserva el envío de `key` a una orden. `true` si esta corrida lo tiene que mandar.
 *
 * @param {D1Database} db
 * @param {SendTable} table
 * @param {{ orderId: string, key: string, now?: number }} input
 */
export async function claimSend(db, table, { orderId, key, now = Date.now() }) {
	const col = keyColumn(table);
	const res = await db
		.prepare(
			`INSERT INTO ${table} (order_id, ${col}, sent_at, status, attempts) VALUES (?1, ?2, ?3, 'sending', 1)
			ON CONFLICT (order_id, ${col}) DO UPDATE SET status = 'sending', sent_at = ?3,
				attempts = ${table}.attempts + 1
			WHERE ${table}.status = 'retry'
				OR (${table}.status = 'sending' AND ${table}.sent_at < ?4 AND ${table}.attempts < ?5)`
		)
		.bind(orderId, key, now, now - STALE_CLAIM_MS, MAX_ATTEMPTS)
		.run();
	return res.meta.changes === 1;
}

/**
 * Cierra una reserva: 'sent', o 'retry' / 'failed' (según los intentos) si falló.
 *
 * @param {D1Database} db
 * @param {SendTable} table
 * @param {{ orderId: string, key: string, ok: boolean, now?: number }} input
 */
export async function finishSend(db, table, { orderId, key, ok, now = Date.now() }) {
	await db
		.prepare(
			`UPDATE ${table} SET sent_at = ?3,
				status = CASE WHEN ?4 = 1 THEN 'sent' WHEN attempts >= ?5 THEN 'failed' ELSE 'retry' END
			WHERE order_id = ?1 AND ${keyColumn(table)} = ?2 AND status = 'sending'`
		)
		.bind(orderId, key, now, ok ? 1 : 0, MAX_ATTEMPTS)
		.run();
}

/**
 * Reservas colgadas que ya usaron todos sus intentos → 'failed' (si no, quedarían "mandando"
 * para siempre y no aparecerían en "Para revisar").
 *
 * @param {D1Database} db
 * @param {SendTable} table
 * @param {number} [now]
 */
export async function expireStaleClaims(db, table, now = Date.now()) {
	await db
		.prepare(
			`UPDATE ${table} SET status = 'failed'
			WHERE status = 'sending' AND sent_at < ?1 AND attempts >= ?2`
		)
		.bind(now - STALE_CLAIM_MS, MAX_ATTEMPTS)
		.run();
}

/**
 * Manda una tanda: reserva y manda a cada candidato hasta `limit` intentos.
 *
 * @template T
 * @param {D1Database} db
 * @param {SendTable} table
 * @param {{
 *   items: T[],
 *   limit: number,
 *   now: number,
 *   claim: (item: T) => { orderId: string, key: string },
 *   send: (item: T) => Promise<boolean>,
 *   label: string
 * }} input
 * @returns {Promise<{ sent: number, failed: number, remaining: number }>}
 *   `remaining`: candidatos que quedaron para la próxima tanda.
 */
export async function sendBatch(db, table, { items, limit, now, claim, send, label }) {
	let sent = 0;
	let failed = 0;
	let tried = 0;
	let seen = 0;
	for (const item of items) {
		if (tried >= limit) break;
		seen++;
		const { orderId, key } = claim(item);
		if (!(await claimSend(db, table, { orderId, key, now }))) continue;
		tried++;
		let ok = false;
		try {
			ok = await send(item);
		} catch (error) {
			console.error(`[tickets] no se pudo mandar ${label} a la orden ${orderId}:`, error);
		}
		await finishSend(db, table, { orderId, key, ok, now });
		if (ok) sent++;
		else failed++;
	}
	return { sent, failed, remaining: items.length - seen };
}

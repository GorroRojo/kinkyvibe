/**
 * Estado de cada envío masivo por orden (recordatorios, link de la transmisión y aviso de cambio
 * de fecha) o por anotación de la lista de espera (oferta, último aviso, vencida y cierre), para
 * mandar en tandas sin duplicar: ver migrations/0011_send_batches.sql,
 * migrations/0048_avisar_cambio_fecha.sql y migrations/0053_lista_de_espera.sql.
 *
 * - Antes de mandar, el envío se reserva con un INSERT/UPDATE atómico ({@link claimSend}): dos
 *   corridas del cron a la vez (o dos admins) nunca mandan dos veces el mismo mail.
 * - Después se marca 'sent', o 'retry' si falló (la próxima tanda lo reintenta), o 'failed' si ya
 *   se intentó {@link MAX_ATTEMPTS} veces: ahí deja de reintentarse solo y aparece en
 *   "Para revisar".
 * - Una reserva 'sending' de más de {@link STALE_CLAIM_MS} es de un Worker que se cortó a la
 *   mitad: se puede volver a reservar (cuenta como otro intento). El mail en sí lleva una clave
 *   de idempotencia de Resend, así que si sí había salido no se duplica.
 *
 * Cada tabla tiene a quién va (`order_id` o, en la lista de espera, `entry_id`) y una o más
 * columnas más en la clave (`waitlist_sends`: `kind` y `round`). Con una sola columna, `key` es
 * un valor; con varias, una lista en el mismo orden ({@link TABLES}).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Intentos por orden antes de dejarlo como 'failed'. */
export const MAX_ATTEMPTS = 3;
/** Una reserva "mandando" más vieja que esto se considera cortada. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * Tablas de envíos: a quién va cada fila (`owner`) y el resto de la clave (`keys`).
 * @type {Readonly<Record<string, { owner: 'order_id' | 'entry_id', keys: readonly string[] }>>}
 */
const TABLES = Object.freeze({
	reminder_sends: { owner: 'order_id', keys: ['reminder_id'] },
	stream_link_sends: { owner: 'order_id', keys: ['link_hash'] },
	date_change_sends: { owner: 'order_id', keys: ['version'] },
	waitlist_sends: { owner: 'entry_id', keys: ['kind', 'round'] }
});

/** @typedef {'reminder_sends' | 'stream_link_sends' | 'date_change_sends' | 'waitlist_sends'} SendTable */
/** @typedef {string | number} KeyValue */
/**
 * A quién va el envío: `orderId` en las tablas por orden, `entryId` en `waitlist_sends`.
 * @typedef {{ orderId?: string, entryId?: string, key: KeyValue | readonly KeyValue[] }} SendRef
 */

/** @param {SendTable} table */
function tableOf(table) {
	const def = Object.hasOwn(TABLES, table) ? TABLES[table] : null;
	if (!def) throw new Error(`tabla de envíos desconocida: ${table}`);
	return def;
}

/**
 * Los valores de la fila (a quién va y el resto de la clave), en el orden de las columnas.
 * @param {SendTable} table
 * @param {SendRef} ref
 */
function rowValues(table, { orderId, entryId, key }) {
	const def = tableOf(table);
	const owner = def.owner === 'order_id' ? orderId : entryId;
	if (typeof owner !== 'string' || !owner) {
		throw new Error(`falta ${def.owner === 'order_id' ? 'orderId' : 'entryId'} para ${table}`);
	}
	const keys = Array.isArray(key) ? key : [key];
	if (keys.length !== def.keys.length) {
		throw new Error(
			`${table} necesita ${def.keys.length} valores de clave (${def.keys.join(', ')})`
		);
	}
	return [owner, ...keys];
}

/**
 * `col = ?1 AND col2 = ?2 …` para la clave entera de la tabla.
 * @param {SendTable} table
 */
function whereKey(table) {
	const def = tableOf(table);
	return [def.owner, ...def.keys].map((c, i) => `${c} = ?${i + 1}`).join(' AND ');
}

/**
 * Condición SQL "a esta orden (o anotación) todavía le falta este envío" (para un `WHERE` sobre
 * `orders o`, o sobre la tabla que diga `alias`): no hay fila, o falló y se reintenta, o quedó
 * colgada. Los parámetros `?{key}` (valor de la clave; en `waitlist_sends`, una lista con el
 * número de cada columna) y `?{stale}` (now − {@link STALE_CLAIM_MS}) los pone quien la usa.
 *
 * @param {SendTable} table
 * @param {{ key: number | readonly number[], stale: number, includeFailed?: boolean,
 *   alias?: string }} params números de parámetro; `alias`: la tabla de afuera (`o` por defecto)
 */
export function pendingSendSql(table, { key, stale, includeFailed = false, alias = 'o' }) {
	const def = tableOf(table);
	const params = Array.isArray(key) ? key : [key];
	if (params.length !== def.keys.length) {
		throw new Error(`${table} necesita ${def.keys.length} parámetros de clave`);
	}
	const keySql = def.keys.map((c, i) => `s.${c} = ?${params[i]}`).join(' AND ');
	const done = includeFailed ? "s.status = 'sent'" : "s.status IN ('sent', 'failed')";
	return `NOT EXISTS (SELECT 1 FROM ${table} s WHERE s.${def.owner} = ${alias}.id AND ${keySql}
		AND (${done} OR (s.status = 'sending' AND s.sent_at >= ?${stale})))`;
}

/**
 * Reserva el envío de `key` a una orden (o anotación). `true` si esta corrida lo tiene que mandar.
 *
 * @param {D1Database} db
 * @param {SendTable} table
 * @param {SendRef & { now?: number }} input
 */
export async function claimSend(db, table, { now = Date.now(), ...ref }) {
	const def = tableOf(table);
	const values = rowValues(table, ref);
	const cols = [def.owner, ...def.keys].join(', ');
	const n = values.length;
	const res = await db
		.prepare(
			`INSERT INTO ${table} (${cols}, sent_at, status, attempts) VALUES (${values.map((_, i) => `?${i + 1}`).join(', ')}, ?${n + 1}, 'sending', 1)
			ON CONFLICT (${cols}) DO UPDATE SET status = 'sending', sent_at = ?${n + 1},
				attempts = ${table}.attempts + 1
			WHERE ${table}.status = 'retry'
				OR (${table}.status = 'sending' AND ${table}.sent_at < ?${n + 2} AND ${table}.attempts < ?${n + 3})`
		)
		.bind(...values, now, now - STALE_CLAIM_MS, MAX_ATTEMPTS)
		.run();
	return res.meta.changes === 1;
}

/**
 * Cierra una reserva: 'sent', o 'retry' / 'failed' (según los intentos) si falló.
 *
 * @param {D1Database} db
 * @param {SendTable} table
 * @param {SendRef & { ok: boolean, now?: number }} input
 */
export async function finishSend(db, table, { ok, now = Date.now(), ...ref }) {
	const values = rowValues(table, ref);
	const n = values.length;
	await db
		.prepare(
			`UPDATE ${table} SET sent_at = ?${n + 1},
				status = CASE WHEN ?${n + 2} = 1 THEN 'sent' WHEN attempts >= ?${n + 3} THEN 'failed' ELSE 'retry' END
			WHERE ${whereKey(table)} AND status = 'sending'`
		)
		.bind(...values, now, ok ? 1 : 0, MAX_ATTEMPTS)
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
	tableOf(table);
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
 *   claim: (item: T) => SendRef,
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
		const ref = claim(item);
		if (!(await claimSend(db, table, { ...ref, now }))) continue;
		tried++;
		let ok = false;
		try {
			ok = await send(item);
		} catch (error) {
			const who = ref.orderId ? `a la orden ${ref.orderId}` : `a la anotación ${ref.entryId}`;
			console.error(`[tickets] no se pudo mandar ${label} ${who}:`, error);
		}
		await finishSend(db, table, { ...ref, ok, now });
		if (ok) sent++;
		else failed++;
	}
	return { sent, failed, remaining: items.length - seen };
}

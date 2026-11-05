/**
 * Chequeo nocturno de consistencia de las órdenes y las entradas (auditoría de plata, D16 y D36).
 * Corre con el chequeo de integridad de los objetos (src/lib/server/scheduled.js) y sus problemas
 * van a la misma corrida de `integrity_runs`, así que se ven en «Para revisar» como «Chequeo
 * nocturno». **Solo lee: nunca arregla nada.**
 *
 * El código de hoy escribe bien estas tablas (los CHECK de `orders` y las entradas que se emiten
 * en la misma tanda que la aprobación); el chequeo es la red por si algo los esquiva: una
 * restauración a mano, un cambio de código o una escritura por fuera de orders.js. Busca:
 *
 * - `db_ticket_count`: una orden aprobada con otra cantidad de entradas que `quantity`, o una
 *   reembolsada con entradas pero no todas (una reembolsada sin ninguna es normal: MP puede
 *   avisar el reembolso de un pago que nunca llegó a aprobar la orden);
 * - `db_ticket_mismatch`: una entrada con otro evento u otro tipo que los de su orden;
 * - `db_surcharge_not_mp`: recargo de Mercado Pago en una orden que no es de Mercado Pago;
 * - `db_free_total`: una orden `gratis` con total distinto de 0;
 * - `db_ticket_no_code`: una entrada sin código corto (vale por QR, pero no se puede tipear en la
 *   puerta; pasa solo si chocan los tres candidatos, ver `issueTicketsStatements`).
 *
 * En cada problema va solo el código, la orden (o la entrada) y el evento: nada de datos de
 * personas. Si una consulta falla (por ejemplo, una base sin la migración de entradas), se
 * escribe en el log y se sigue con las demás.
 *
 * Solo usa imports relativos (lo usa el cron, que no pasa por Vite).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {'db_ticket_count' | 'db_ticket_mismatch' | 'db_surcharge_not_mp' | 'db_free_total'
 *   | 'db_ticket_no_code'} ConsistencyCode
 */

/**
 * Lo mismo que guarda el chequeo de objetos (`Problem` de objects/integrity.js): en `slug`, la
 * orden o la entrada y su evento, que es lo que muestra «Para revisar».
 *
 * @typedef {{ code: ConsistencyCode, message: string, slug: string }} ConsistencyProblem
 */

/** Filas por chequeo, como mucho (la corrida guarda 50 problemas en total). */
export const CONSISTENCY_LIMIT = 50;

/**
 * Cada chequeo: su código, la consulta (devuelve `id`, `event_slug` y `detail`) y el mensaje.
 *
 * @type {readonly { code: ConsistencyCode, sql: string, what: 'orden' | 'entrada',
 *   message: (row: { id: string, event_slug: string, detail: string }) => string }[]}
 */
const CHECKS = Object.freeze([
	{
		code: 'db_ticket_count',
		what: 'orden',
		sql: `SELECT o.id, o.event_slug, o.status || ': ' || COUNT(t.id) || ' de ' || o.quantity AS detail
			FROM orders o LEFT JOIN tickets t ON t.order_id = o.id
			WHERE o.status IN ('approved', 'refunded')
			GROUP BY o.id
			HAVING (o.status = 'approved' AND COUNT(t.id) <> o.quantity)
				OR (o.status = 'refunded' AND COUNT(t.id) NOT IN (0, o.quantity))`,
		message: (r) => `La orden ${r.id} tiene otra cantidad de entradas (${r.detail}).`
	},
	{
		code: 'db_ticket_mismatch',
		what: 'entrada',
		sql: `SELECT t.id, o.event_slug,
				t.event_slug || ' / ' || t.ticket_type || ' en vez de ' || o.event_slug || ' / ' || o.ticket_type AS detail
			FROM tickets t JOIN orders o ON o.id = t.order_id
			WHERE t.event_slug <> o.event_slug OR t.ticket_type <> o.ticket_type`,
		message: (r) => `La entrada ${r.id} no es del evento o del tipo de su orden (${r.detail}).`
	},
	{
		code: 'db_surcharge_not_mp',
		what: 'orden',
		sql: `SELECT id, event_slug, payment_method || ', recargo ' || surcharge_amount AS detail
			FROM orders WHERE surcharge_amount > 0 AND payment_method <> 'mercadopago'`,
		message: (r) => `La orden ${r.id} tiene recargo de Mercado Pago sin ser de MP (${r.detail}).`
	},
	{
		code: 'db_free_total',
		what: 'orden',
		sql: `SELECT id, event_slug, 'total ' || total AS detail
			FROM orders WHERE payment_method = 'gratis' AND total <> 0`,
		message: (r) => `La orden ${r.id} es sin cargo pero tiene otro total (${r.detail}).`
	},
	{
		code: 'db_ticket_no_code',
		what: 'entrada',
		sql: `SELECT id, event_slug, '' AS detail FROM tickets WHERE code IS NULL`,
		message: (r) => `La entrada ${r.id} no tiene código corto (vale el QR).`
	}
]);

/**
 * Corre los chequeos y devuelve los problemas (vacío si está todo bien). Nunca tira: un chequeo
 * que falla se escribe en el log y se saltea.
 *
 * @param {D1Database} db
 * @param {{ limit?: number }} [options] filas por chequeo, como mucho
 * @returns {Promise<ConsistencyProblem[]>}
 */
export async function checkOrdersConsistency(db, { limit = CONSISTENCY_LIMIT } = {}) {
	/** @type {ConsistencyProblem[]} */
	const problems = [];
	for (const check of CHECKS) {
		try {
			const { results } = await db.prepare(`${check.sql} LIMIT ${Number(limit)}`).all();
			for (const raw of results) {
				const row = {
					id: String(raw.id),
					event_slug: String(raw.event_slug),
					detail: String(raw.detail ?? '')
				};
				problems.push({
					code: check.code,
					message: check.message(row),
					slug: `${check.what} ${row.id} (${row.event_slug})`
				});
			}
		} catch (error) {
			console.error(`[consistencia] el chequeo ${check.code} falló:`, error);
		}
	}
	return problems;
}

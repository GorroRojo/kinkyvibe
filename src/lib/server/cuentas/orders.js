/**
 * Compras de una cuenta, solo lectura (decisión P7.5: las compras viejas aparecen solas por el
 * mail verificado). Una orden es de la cuenta si:
 * - tiene `account_id` de esta cuenta (compras con cuenta, más adelante), o
 * - su `buyer_email` es el mail de la cuenta y ese mail está verificado.
 *
 * Nada se escribe: las órdenes no se "adoptan". Si la cuenta se borra, las compras por mail dejan
 * de verse porque ya no hay cuenta, y las con `account_id` quedan desvinculadas (accounts.js).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Estados que se muestran (las reservas vencidas, rechazadas o canceladas, no). */
export const VISIBLE_STATUSES = /** @type {const} */ ([
	'approved',
	'awaiting_transfer',
	'refunded'
]);

/**
 * @typedef {{
 *   id: string, event_slug: string, ticket_type: string, quantity: number, total: number,
 *   status: string, payment_method: string, created_at: number
 * }} AccountOrder
 */

/**
 * Las compras de la cuenta, de la más nueva a la más vieja. Solo columnas para listar (sin DNI
 * ni nombres de las entradas).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<AccountOrder[]>}
 */
export async function ordersForAccount(db, accountId, { limit = 100 } = {}) {
	const account = await db
		.prepare('SELECT email, email_verified_at FROM accounts WHERE id = ?1 AND deleted_at IS NULL')
		.bind(accountId)
		.first();
	if (!account) return [];
	// Solo con el mail verificado; si no, un mail que no se sabe si es de la persona no trae nada.
	const email = account.email_verified_at == null ? null : String(account.email);
	const statuses = VISIBLE_STATUSES.map((s) => `'${s}'`).join(', ');
	const columns = `id, event_slug, ticket_type, quantity, total, status, payment_method, created_at`;
	// UNION (y no OR) para que cada mitad use su índice: orders_account y orders_email_lower.
	const { results } = await db
		.prepare(
			`SELECT ${columns} FROM orders WHERE account_id = ?1 AND status IN (${statuses})
			UNION
			SELECT ${columns} FROM orders WHERE ?2 IS NOT NULL AND lower(buyer_email) = ?2
				AND status IN (${statuses})
			ORDER BY created_at DESC
			LIMIT ?3`
		)
		.bind(accountId, email, limit)
		.all();
	return results.map((r) => ({
		id: String(r.id),
		event_slug: String(r.event_slug),
		ticket_type: String(r.ticket_type),
		quantity: Number(r.quantity),
		total: Number(r.total),
		status: String(r.status),
		payment_method: String(r.payment_method),
		created_at: Number(r.created_at)
	}));
}

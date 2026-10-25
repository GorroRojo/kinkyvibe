/**
 * Compras de una cuenta, solo lectura (decisión P7.5: las compras viejas aparecen solas por el
 * mail verificado). Una orden es de la cuenta si:
 * - tiene `account_id` de esta cuenta (compras con cuenta, más adelante), o
 * - su `buyer_email` es el mail de la cuenta y ese mail está verificado.
 *
 * Nada se escribe en las órdenes: no se "adoptan". Si la cuenta se borra, las compras por mail
 * dejan de verse porque ya no hay cuenta, y las con `account_id` quedan desvinculadas (accounts.js).
 *
 * «No fui yo», parte 2 (docs/mails.md): cualquiera puede escribir un mail ajeno en el formulario de
 * entradas gratis. Una orden **gratis** que llega solo por el mail (sin `account_id` de la cuenta)
 * no se lista hasta que la cuenta dice «Sí, son mías» (o la pidió con la sesión de esa cuenta);
 * mientras tanto va en «¿Son tuyas?» ({@link unconfirmedFreeOrders}). Con «No es mía» deja de
 * mostrarse para esa cuenta. Lo elegido va en `free_order_choices` (migración 0061). Las compras
 * pagas se ven siempre, y también las gratis que cargan les admins (la puerta, la carga a mano:
 * `channel` distinto de `online`) y las de antes de la migración ({@link FREE_ORDER_CHOICES_SINCE}).
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
 * La clave de `ticket_settings` con el momento (ms) desde el que se pregunta: la escribe la
 * migración 0061 al aplicarse, con la hora de la base. Las órdenes de antes se ven como siempre.
 * Sin la fila, no se pregunta por ninguna (lo seguro: nada desaparece).
 */
export const FREE_ORDER_CHOICES_SINCE = 'free_order_choices_since';

/**
 * SQL: la orden `alias` es de las que se preguntan si llegan solo por el mail. Gratis, del
 * formulario público (`channel = 'online'`) y de después de la migración. Nunca da NULL.
 *
 * @param {string} alias
 */
export const askFreeOrderSql = (alias) =>
	`(${alias}.payment_method = 'gratis' AND ${alias}.channel = 'online' AND ${alias}.created_at >=
		COALESCE((SELECT CAST(value AS INTEGER) FROM ticket_settings
			WHERE key = '${FREE_ORDER_CHOICES_SINCE}'), ${Number.MAX_SAFE_INTEGER}))`;

/**
 * SQL: la cuenta `account` dijo «Sí, son mías» sobre la orden `alias`.
 *
 * @param {string} alias
 * @param {string} account expresión SQL con el id de la cuenta
 */
export const saidMineSql = (alias, account) =>
	`EXISTS (SELECT 1 FROM free_order_choices c
		WHERE c.account_id = ${account} AND c.order_id = ${alias}.id AND c.mine = 1)`;

const COLUMNS = `id, event_slug, ticket_type, quantity, total, status, payment_method, created_at`;
const STATUSES_SQL = VISIBLE_STATUSES.map((s) => `'${s}'`).join(', ');

/**
 * El mail de la cuenta si está verificado (en minúsculas tal como se guarda), `null` si no lo
 * está, o `undefined` si la cuenta no existe o está borrada.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<string | null | undefined>}
 */
export async function verifiedEmail(db, accountId) {
	const account = await db
		.prepare('SELECT email, email_verified_at FROM accounts WHERE id = ?1 AND deleted_at IS NULL')
		.bind(accountId)
		.first();
	if (!account) return undefined;
	// Solo con el mail verificado; si no, un mail que no se sabe si es de la persona no trae nada.
	return account.email_verified_at == null ? null : String(account.email);
}

/** @param {Record<string, unknown>} r @returns {AccountOrder} */
const toOrder = (r) => ({
	id: String(r.id),
	event_slug: String(r.event_slug),
	ticket_type: String(r.ticket_type),
	quantity: Number(r.quantity),
	total: Number(r.total),
	status: String(r.status),
	payment_method: String(r.payment_method),
	created_at: Number(r.created_at)
});

/**
 * Las compras de la cuenta, de la más nueva a la más vieja. Solo columnas para listar (sin DNI
 * ni nombres de las entradas). Sin las órdenes gratis que llegan solo por el mail y la cuenta no
 * dijo que son suyas (esas van en {@link unconfirmedFreeOrders}).
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ limit?: number, email?: string | null }} [opts] `email`: el de {@link verifiedEmail},
 *   si ya se leyó (así la página no vuelve a leer la cuenta)
 * @returns {Promise<AccountOrder[]>}
 */
export async function ordersForAccount(db, accountId, { limit = 100, ...opts } = {}) {
	const email = 'email' in opts ? opts.email : await verifiedEmail(db, accountId);
	if (email === undefined) return [];
	// UNION (y no OR) para que cada mitad use su índice: orders_account y orders_email_lower.
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNS} FROM orders WHERE account_id = ?1 AND status IN (${STATUSES_SQL})
			UNION
			SELECT ${COLUMNS} FROM orders o WHERE ?2 IS NOT NULL AND lower(buyer_email) = ?2
				AND status IN (${STATUSES_SQL})
				AND (NOT ${askFreeOrderSql('o')} OR ${saidMineSql('o', '?1')})
			ORDER BY created_at DESC
			LIMIT ?3`
		)
		.bind(accountId, email, limit)
		.all();
	return results.map(toOrder);
}

/**
 * «¿Son tuyas?»: las órdenes gratis con el mail verificado de la cuenta que no tienen su
 * `account_id` y sobre las que la cuenta todavía no eligió. De la más nueva a la más vieja.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @param {{ limit?: number, email?: string | null }} [opts] `email`: el de {@link verifiedEmail},
 *   si ya se leyó (así la página no vuelve a leer la cuenta)
 * @returns {Promise<AccountOrder[]>}
 */
export async function unconfirmedFreeOrders(db, accountId, { limit = 100, ...opts } = {}) {
	const email = 'email' in opts ? opts.email : await verifiedEmail(db, accountId);
	if (!email) return [];
	const { results } = await db
		.prepare(
			`SELECT ${COLUMNS} FROM orders o WHERE lower(buyer_email) = ?2
				AND status IN (${STATUSES_SQL}) AND ${askFreeOrderSql('o')}
				AND (account_id IS NULL OR account_id <> ?1)
				AND NOT EXISTS (
					SELECT 1 FROM free_order_choices c WHERE c.account_id = ?1 AND c.order_id = o.id
				)
			ORDER BY created_at DESC
			LIMIT ?3`
		)
		.bind(accountId, email, limit)
		.all();
	return results.map(toOrder);
}

/**
 * Anota lo que eligió la cuenta sobre una orden gratis: `mine` = «Sí, son mías» (pasa a la lista
 * de siempre) o «No es mía» (deja de mostrarse). Solo vale para una orden de las que se preguntan
 * ({@link askFreeOrderSql}) con el mail verificado de la cuenta; si no, devuelve `false` y no escribe nada. Elegir de nuevo cambia lo
 * elegido. También la usa la compra con sesión ({@link markFreeOrderMine}).
 *
 * @param {D1Database} db
 * @param {{ accountId: string, orderId: string, mine: boolean, now?: number }} input
 * @returns {Promise<boolean>}
 */
export async function chooseFreeOrder(db, { accountId, orderId, mine, now = Date.now() }) {
	const email = await verifiedEmail(db, accountId);
	if (!email) return false;
	const { results } = await db
		.prepare(
			`INSERT INTO free_order_choices (account_id, order_id, mine, created_at)
			SELECT ?1, o.id, ?3, ?4 FROM orders o
			WHERE o.id = ?2 AND ${askFreeOrderSql('o')} AND lower(o.buyer_email) = ?5
			ON CONFLICT (account_id, order_id) DO UPDATE SET mine = excluded.mine,
				created_at = excluded.created_at
			RETURNING order_id`
		)
		.bind(accountId, orderId, mine ? 1 : 0, now, email)
		.all();
	return results.length > 0;
}

/**
 * Una orden gratis pedida con la sesión de la cuenta de ese mail: es suya, se lista como siempre.
 * Nunca tira (si falla, la orden queda en «¿Son tuyas?» y la persona la confirma con un toque).
 *
 * @param {D1Database} db
 * @param {{ accountId: string, orderId: string, now?: number }} input
 */
export async function markFreeOrderMine(db, { accountId, orderId, now }) {
	try {
		await chooseFreeOrder(db, { accountId, orderId, mine: true, now });
	} catch {
		console.error('[cuentas] no se pudo anotar una orden gratis como de la cuenta');
	}
}

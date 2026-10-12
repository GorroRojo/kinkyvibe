/**
 * «Mis entradas» desde el bot: de dónde salen las entradas de la cuenta vinculada a un chat. Solo
 * lectura, solo por chat privado vinculado (lo decide router.js) y con las mismas reglas que Mi
 * rincón (`ordersForAccount`: las compras con la cuenta o con su mail verificado), solo las
 * compras **aprobadas** (las únicas con entradas que valen).
 *
 * Nunca se loguea un token: los errores se cuentan sin datos.
 */
import { ordersForAccount } from '$lib/server/cuentas/orders.js';
import { getEventTickets } from '$lib/server/tickets/events.js';
import { chatAccount } from './seguir.js';
import { shortHash } from './nav.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * Una entrada de la cuenta, con lo que muestra su página (`/entradas/t/<token>`): nunca el DNI ni
 * los datos de quien compró. `id`: un hash corto del id de la entrada (lo que lleva el botón).
 *
 * @typedef {{
 *   id: string, token: string, code: string | null, holder: string, pronouns: string,
 *   type: string, slug: string, title: string, start: string | null, end: string | null,
 *   online: boolean, checkedInAt: number | null
 * }} BotTicket
 */
/**
 * @typedef {{
 *   accountFor: (chatId: number | string) => Promise<string | null>,
 *   list: (accountId: string) => Promise<BotTicket[]>
 * }} BotTickets
 */

/** Cuántas compras se miran, como mucho (las más nuevas; como Mi rincón). */
export const TICKET_ORDERS_MAX = 100;

/** @param {unknown} v */
const isoOrNull = (v) => {
	if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
	return typeof v === 'string' && v ? v : null;
};

/**
 * Las entradas de las compras aprobadas de la cuenta. Una consulta para las compras y una para
 * todas sus entradas; los datos del evento (título, fecha, tipos), uno por evento.
 *
 * @param {D1Database} db
 * @param {string} accountId
 * @returns {Promise<BotTicket[]>}
 */
export async function accountTickets(db, accountId) {
	const orders = (await ordersForAccount(db, accountId, { limit: TICKET_ORDERS_MAX })).filter(
		(o) => o.status === 'approved'
	);
	if (orders.length === 0) return [];
	const { results } = await db
		.prepare(
			`SELECT t.id, t.order_id, t.event_slug, t.ticket_type, t.holder_name, t.holder_pronouns,
				t.token, t.code, t.checked_in_at
			FROM tickets t JOIN orders o ON o.id = t.order_id
			WHERE t.order_id IN (SELECT value FROM json_each(?1)) AND o.status = 'approved'
			ORDER BY t.rowid`
		)
		.bind(JSON.stringify(orders.map((o) => o.id)))
		.all();
	/** @type {Map<string, Awaited<ReturnType<typeof getEventTickets>>>} */
	const configs = new Map();
	/** @type {BotTicket[]} */
	const out = [];
	for (const row of results) {
		const slug = String(row.event_slug);
		if (!configs.has(slug)) {
			let config = null;
			try {
				config = await getEventTickets(slug);
			} catch {
				console.error('[telegram] mis entradas: no se pudo leer un evento');
			}
			configs.set(slug, config);
		}
		const config = configs.get(slug) ?? null;
		const typeId = String(row.ticket_type);
		out.push({
			id: shortHash(String(row.id)),
			token: String(row.token),
			code: row.code ? String(row.code) : null,
			holder: String(row.holder_name ?? ''),
			pronouns: row.holder_pronouns ? String(row.holder_pronouns) : '',
			type: config?.types.find((t) => t.id === typeId)?.name ?? typeId,
			slug,
			title: config?.title ?? slug,
			start: isoOrNull(config?.start),
			end: isoOrNull(config?.end),
			online: Boolean(config?.online),
			checkedInAt: row.checked_in_at == null ? null : Number(row.checked_in_at)
		});
	}
	return out;
}

/**
 * Lo que el bot puede hacer con las entradas (router.js no sabe de la base).
 *
 * @param {D1Database} db
 * @returns {BotTickets}
 */
export function botTickets(db) {
	return {
		accountFor: (chatId) => chatAccount(db, chatId),
		list: (accountId) => accountTickets(db, accountId)
	};
}

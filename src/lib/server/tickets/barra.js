/**
 * La barra con link (/barra/<evento>; docs/tickets.md, «Link de barra»): buscar una entrada de
 * **este** evento por QR, código o nombre y ver solo sus extras. Lo mínimo de la persona: el nombre
 * de la entrada. Nada de quien compró (ni mail ni DNI), ni ingresos, ni ventas.
 */
import { extractToken } from './checkin.js';
import { orderExtras } from './extras.js';
import { foldText } from '$lib/utils/text.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('./extras.js').OrderExtra} OrderExtra */

/**
 * Para la barra: la entrada de un QR, link o código de **este** evento, con lo mínimo (nombre de
 * la entrada y su id) y los extras de su orden. Sin datos de quien compró, ni mail, ni DNI.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, raw: unknown }} input
 * @returns {Promise<{ ticketId: string, holder: string, status: string, extras: OrderExtra[] } | null>}
 */
export async function barLookup(db, { eventSlug, raw }) {
	const token = await extractToken(db, eventSlug, raw);
	if (!token) return null;
	const t = await db
		.prepare(
			`SELECT t.id, t.order_id, t.holder_name, o.status FROM tickets t
			JOIN orders o ON o.id = t.order_id WHERE t.token = ?1 AND t.event_slug = ?2`
		)
		.bind(token, eventSlug)
		.first();
	if (!t) return null;
	return {
		ticketId: String(t.id),
		holder: String(t.holder_name),
		status: String(t.status),
		extras: await orderExtras(db, String(t.order_id))
	};
}

/**
 * Para la barra: buscar por el nombre de la entrada (desde 2 letras), solo entradas con extras en
 * órdenes aprobadas de **este** evento. Devuelve nombre e id de la entrada, nada más.
 *
 * @param {D1Database} db
 * @param {{ eventSlug: string, q: string, limit?: number }} input
 * @returns {Promise<{ ticketId: string, holder: string }[]>}
 */
export async function barSearch(db, { eventSlug, q, limit = 8 }) {
	const needle = foldText(String(q ?? '').trim()).slice(0, 60);
	if (needle.length < 2) return [];
	const { results } = await db
		.prepare(
			`SELECT t.id, t.holder_name FROM tickets t JOIN orders o ON o.id = t.order_id
			WHERE t.event_slug = ?1 AND o.status = 'approved'
				AND EXISTS (SELECT 1 FROM order_extras oe WHERE oe.order_id = t.order_id)
			ORDER BY t.holder_name`
		)
		.bind(eventSlug)
		.all();
	return results
		.filter((r) => foldText(String(r.holder_name)).includes(needle))
		.slice(0, limit)
		.map((r) => ({ ticketId: String(r.id), holder: String(r.holder_name) }));
}

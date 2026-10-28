/**
 * Control de ingreso: qué se acepta en el campo "Código de la entrada" y cómo se muestran los
 * resultados del buscador (sugerencias del modo puerta, /admin/eventos/<slug>/ingreso).
 */
import { dniTail, linkSafeBy } from './door.js';
import { SEARCH_FIELD_LABELS, normalizeTicketCode, tokenByCode } from './orders.js';

/** Prefijo de una entrada elegida en el buscador por su id (`ticket:<id>`): solo de este evento. */
export const TICKET_ID_PREFIX = 'ticket:';

/**
 * Acepta el token solo, la URL completa del QR (/entradas/t/<token>), el código corto que está
 * al lado del QR (6 caracteres, con o sin "KV-", espacios o guiones) o `ticket:<id>` (una entrada
 * de **este** evento elegida en el buscador, que con un link de puerta no trae el token).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} slug
 * @param {unknown} raw
 */
export async function extractToken(db, slug, raw) {
	const s = String(raw ?? '')
		.trim()
		.slice(0, 500);
	const m = s.match(/\/entradas\/t\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/);
	if (m) return m[1];
	const byId = s.match(/^ticket:([A-Za-z0-9_-]{1,64})$/);
	if (byId) {
		const row = await db
			.prepare('SELECT token FROM tickets WHERE id = ?1 AND event_slug = ?2')
			.bind(byId[1], slug)
			.first();
		return row ? String(row.token) : '';
	}
	const code = normalizeTicketCode(s);
	if (code) {
		const here = await tokenByCode(db, slug, code);
		if (here) return here;
		// Los códigos son únicos por evento: si es de UN otro evento, que diga "Es de otro evento".
		const { results } = await db
			.prepare('SELECT token FROM tickets WHERE code = ?1 LIMIT 2')
			.bind(code)
			.all();
		return results.length === 1 ? String(results[0].token) : '';
	}
	return s;
}

/**
 * Resultados del buscador (lo mismo que ya ve une admin en la lista de órdenes). Del DNI viajan
 * solo los últimos 3 dígitos, los que muestra la sugerencia («coincide con DNI: •••.333»): la
 * búsqueda por DNI completo se hace en el servidor (`searchTickets`) y verlo entero es la acción
 * «ver completo», que queda en el registro de actividad.
 *
 * Con `forLink` (la puerta con un link): sin el token de la entrada (para marcar el ingreso desde
 * una sugerencia alcanzan el código o `ticket:<id>`, ver `extractToken`), sin el login de GitHub
 * de quien marcó el ingreso si fue une admin (`linkSafeBy`) y sin `notice` (decisión 0053: con un
 * link, los avisos de puerta nunca van en las sugerencias, aunque venga `noticeIds`).
 *
 * `notice` (solo sin `forLink`): la entrada coincide con un aviso de puerta (los ids de
 * `noticeIds`, ver doorNotices.js); la pantalla muestra solo el texto genérico.
 *
 * @param {import('./orders.js').TicketSearchResult[]} found
 * @param {Record<string, string>} names
 * @param {{ forLink?: boolean, noticeIds?: Set<string> }} [opts]
 */
export function searchRows(found, names, { forLink = false, noticeIds = new Set() } = {}) {
	return found.map((t) => ({
		id: t.id,
		...(forLink ? {} : { token: t.token }),
		code: t.code ?? '',
		holder: t.holder_name,
		pronouns: t.holder_pronouns ?? '',
		buyer: t.buyer_name,
		email: t.buyer_email,
		type: names[t.ticket_type] ?? t.ticket_type,
		checkedInAt: t.checked_in_at,
		checkedInBy: forLink ? linkSafeBy(t.checked_in_by) : t.checked_in_by,
		...(forLink ? {} : { notice: noticeIds.has(t.id) }),
		match: t.match
			? {
					field: t.match.field,
					label: SEARCH_FIELD_LABELS[t.match.field],
					value: t.match.field === 'dni' ? dniTail(t.match.value) : t.match.value
				}
			: null
	}));
}

/**
 * Control de ingreso: qué se acepta en el campo "Código de la entrada" y cómo se muestran los
 * resultados del buscador (sugerencias del modo puerta, /admin/eventos/<slug>/ingreso).
 */
import { SEARCH_FIELD_LABELS, normalizeTicketCode, tokenByCode } from './orders.js';

/**
 * Acepta el token solo, la URL completa del QR (/entradas/t/<token>) o el código corto que está
 * al lado del QR (6 caracteres, con o sin "KV-", espacios o guiones).
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
 * Resultados del buscador (lo mismo que ya ve une admin en la lista de órdenes).
 *
 * @param {import('./orders.js').TicketSearchResult[]} found
 * @param {Record<string, string>} names
 */
export function searchRows(found, names) {
	return found.map((t) => ({
		id: t.id,
		token: t.token,
		code: t.code ?? '',
		holder: t.holder_name,
		pronouns: t.holder_pronouns ?? '',
		buyer: t.buyer_name,
		dni: t.buyer_dni ?? '',
		email: t.buyer_email,
		type: names[t.ticket_type] ?? t.ticket_type,
		checkedInAt: t.checked_in_at,
		checkedInBy: t.checked_in_by,
		match: t.match
			? { field: t.match.field, label: SEARCH_FIELD_LABELS[t.match.field], value: t.match.value }
			: null
	}));
}

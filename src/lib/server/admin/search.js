/**
 * Buscador global del panel (paleta de comandos): busca eventos, órdenes (`KV-…`, nombre o email
 * de quien compró), entradas (código corto), códigos de descuento y personas.
 *
 * Solo para admins (Q30). El DNI nunca sale de la base: si alguien busca por DNI, la consulta
 * devuelve solo los últimos 3 dígitos para mostrar "DNI ···123". Las búsquedas no se guardan.
 */
import { argDateList } from '$lib/utils/dates.js';
import { logDBError } from '$lib/server/db';
import { foldText, normalizeTicketCode } from '$lib/server/tickets/orders.js';
import { orderReference } from '$lib/utils/tickets.js';
import { eventLink, orderHref } from '$lib/admin/links.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/eventos/index.js').EventSummary} EventSummary */

/**
 * @typedef {{ id: string, icon: string, title: string, sub: string, href: string }} SearchItem
 * @typedef {{ id: string, label: string, items: SearchItem[] }} SearchGroup
 */

export const MIN_QUERY = 2;
export const MAX_QUERY = 80;

const STATUS_LABEL = /** @type {Record<string, string>} */ ({
	pending: 'pendiente',
	awaiting_transfer: 'espera transferencia',
	approved: 'aprobada',
	rejected: 'rechazada',
	cancelled: 'cancelada',
	refunded: 'reembolsada',
	expired: 'vencida'
});

/**
 * Patrón LIKE que busca `text` en cualquier parte (con `%` y `_` escapados; usar `ESCAPE '\'`).
 * @param {string} text
 */
export function likeContains(text) {
	return `%${text.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
}

/**
 * Comienzo del id de una orden si la búsqueda parece una referencia (`KV-1A2B3C4D`, con o sin
 * `KV-`, desde 4 caracteres hexadecimales), en minúsculas como están los ids. Si no, `null`.
 * @param {string} q
 */
export function orderIdPrefix(q) {
	const m = /^(?:kv[\s-]?)?([0-9a-f]{4,8})$/i.exec(q.trim());
	return m ? m[1].toLowerCase() : null;
}

/** @param {number} ms */
const shortDate = (ms) => argDateList(ms, { time: false });

/**
 * Eventos por título o slug, sin distinguir mayúsculas ni tildes (del bundle: anda sin base).
 * Primero los que empiezan con lo buscado, después los más nuevos.
 *
 * @param {EventSummary[]} events
 * @param {string} q
 * @param {{ limit?: number, ticketed?: Set<string> }} [opts]
 * @returns {SearchItem[]}
 */
export function searchEvents(events, q, { limit = 6, ticketed = new Set() } = {}) {
	const f = foldText(q);
	if (f.length < MIN_QUERY) return [];
	const found = [];
	for (const e of events) {
		const title = foldText(e.title);
		const at = title.indexOf(f);
		const inSlug = e.slug.includes(f.replace(/\s+/g, '-'));
		if (at === -1 && !inSlug) continue;
		found.push({ e, rank: at === 0 ? 0 : at > 0 ? 1 : 2 });
	}
	found.sort((a, b) => a.rank - b.rank || (b.e.start || '').localeCompare(a.e.start || ''));
	return found.slice(0, limit).map(({ e }) => ({
		id: `event:${e.slug}`,
		icon: 'event',
		title: e.title,
		sub: [e.start ? e.start.slice(0, 10) : '', e.unlisted ? 'no listado' : '', e.slug]
			.filter(Boolean)
			.join(' · '),
		href: eventLink(e.slug, { tickets: ticketed.has(e.slug) })
	}));
}

/**
 * @template T
 * @param {D1Database} db
 * @param {string} what
 * @param {(db: D1Database) => Promise<T[]>} fn
 * @returns {Promise<T[]>}
 */
async function safe(db, what, fn) {
	try {
		return await fn(db);
	} catch (error) {
		logDBError(`buscador: ${what}`, error);
		return [];
	}
}

/**
 * Registros de la base: órdenes, entradas, códigos y personas.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} q
 * @param {{ titles?: Map<string, string> }} [opts]
 * @returns {Promise<{ orders: SearchItem[], tickets: SearchItem[], codes: SearchItem[], people: SearchItem[] }>}
 */
export async function searchDatabase(db, q, { titles = new Map() } = {}) {
	const empty = { orders: [], tickets: [], codes: [], people: [] };
	const query = q.trim().slice(0, MAX_QUERY);
	if (!db || query.length < MIN_QUERY) return empty;
	const like = likeContains(query);
	const idPrefix = orderIdPrefix(query);
	const digits = query.replace(/[.\s-]/g, '');
	const dniLike = /^\d{6,}$/.test(digits) ? likeContains(digits) : '';
	const code = normalizeTicketCode(query);
	/** @param {string} slug */
	const title = (slug) => titles.get(slug) ?? slug;

	const [orders, tickets, codes, people] = await Promise.all([
		safe(db, 'órdenes', async (db) => {
			const { results } = await db
				.prepare(
					`SELECT id, event_slug, status, buyer_name, buyer_email, quantity, total, created_at,
						CASE WHEN ?3 != '' AND buyer_dni LIKE ?3 ESCAPE '\\' THEN substr(buyer_dni, -3) END AS dni_tail
					FROM orders
					WHERE (?1 != '' AND id LIKE ?1 || '%')
						OR buyer_name LIKE ?2 ESCAPE '\\' OR buyer_email LIKE ?2 ESCAPE '\\'
						OR (?3 != '' AND buyer_dni LIKE ?3 ESCAPE '\\')
					ORDER BY created_at DESC LIMIT 8`
				)
				.bind(idPrefix ?? '', like, dniLike)
				.all();
			return results.map((r) => {
				const id = String(r.id);
				const slug = String(r.event_slug);
				return {
					id: `order:${id}`,
					icon: 'order',
					title: `${orderReference(id)} · ${r.buyer_name}`,
					sub: [
						r.dni_tail ? `DNI ···${r.dni_tail}` : String(r.buyer_email),
						`${r.quantity} × ${title(slug)}`,
						STATUS_LABEL[String(r.status)] ?? String(r.status),
						shortDate(Number(r.created_at))
					].join(' · '),
					href: orderHref(slug, id)
				};
			});
		}),
		safe(db, 'entradas', async (db) => {
			const { results } = await db
				.prepare(
					`SELECT t.code, t.event_slug, t.holder_name, t.order_id, t.checked_in_at, o.status
					FROM tickets t JOIN orders o ON o.id = t.order_id
					WHERE (?1 != '' AND t.code = ?1) OR t.holder_name LIKE ?2 ESCAPE '\\'
					ORDER BY (t.code = ?1) DESC, o.created_at DESC LIMIT 6`
				)
				.bind(code ?? '', like)
				.all();
			return results.map((r) => {
				const slug = String(r.event_slug);
				return {
					id: `ticket:${slug}:${r.code}`,
					icon: 'ticket',
					title: `${r.holder_name} · ${r.code ?? ''}`,
					sub: [
						title(slug),
						r.checked_in_at ? 'ya ingresó' : 'sin usar',
						r.status === 'approved' ? '' : (STATUS_LABEL[String(r.status)] ?? '')
					]
						.filter(Boolean)
						.join(' · '),
					href: orderHref(slug, String(r.order_id))
				};
			});
		}),
		safe(db, 'códigos', async (db) => {
			const { results } = await db
				.prepare(
					`SELECT code, kind, value, event_slug, active FROM discount_codes
					WHERE code LIKE ?1 ESCAPE '\\' ORDER BY active DESC, created_at DESC LIMIT 5`
				)
				.bind(like)
				.all();
			return results.map((r) => ({
				id: `code:${r.code}`,
				icon: 'code',
				title: String(r.code),
				sub: [
					r.kind === 'percent' ? `${r.value} %` : `$ ${Number(r.value).toLocaleString('es-AR')}`,
					r.event_slug ? title(String(r.event_slug)) : 'todos los eventos',
					Number(r.active) ? 'activo' : 'desactivado'
				].join(' · '),
				href: '/admin/ventas/codigos'
			}));
		}),
		safe(db, 'personas', async (db) => {
			// SQLite: con MAX() las columnas sueltas salen de la fila del máximo (la última compra).
			const { results } = await db
				.prepare(
					`SELECT lower(buyer_email) AS email, buyer_name, buyer_pronouns, id, event_slug,
						MAX(created_at) AS last_at, COUNT(*) AS n, SUM(quantity) AS tickets
					FROM orders
					WHERE status IN ('approved', 'refunded')
						AND (buyer_name LIKE ?1 ESCAPE '\\' OR buyer_email LIKE ?1 ESCAPE '\\')
					GROUP BY lower(buyer_email) ORDER BY last_at DESC LIMIT 5`
				)
				.bind(like)
				.all();
			return results.map((r) => ({
				id: `person:${r.email}`,
				icon: 'person',
				title: r.buyer_pronouns ? `${r.buyer_name} (${r.buyer_pronouns})` : String(r.buyer_name),
				sub: `${r.email} · ${r.n} ${Number(r.n) === 1 ? 'compra' : 'compras'} · última: ${title(String(r.event_slug))}`,
				href: orderHref(String(r.event_slug), String(r.id))
			}));
		})
	]);
	return { orders, tickets, codes, people };
}

/**
 * Todos los grupos de resultados, en el orden en que se muestran (los vacíos no van).
 *
 * @param {{ events: SearchItem[], orders: SearchItem[], tickets: SearchItem[], codes: SearchItem[], people: SearchItem[] }} r
 * @returns {SearchGroup[]}
 */
export function groupResults(r) {
	return [
		{ id: 'events', label: 'Eventos', items: r.events },
		{ id: 'orders', label: 'Órdenes', items: r.orders },
		{ id: 'people', label: 'Personas', items: r.people },
		{ id: 'tickets', label: 'Entradas', items: r.tickets },
		{ id: 'codes', label: 'Códigos de descuento', items: r.codes }
	].filter((g) => g.items.length);
}

/**
 * Personas (base de clientes del panel, `/admin/comunidad/personas`) y los datos de Estadísticas:
 * salen de las órdenes, agrupadas por email normalizado. Solo admins. Nunca se lee el DNI.
 *
 * - Compró un evento: tiene una orden aprobada (o reembolsada, que se muestra pero no suma).
 * - Vino: al menos una entrada de esa orden tiene check-in.
 * - No vino ("no-show"): compró (aprobada), el evento ya pasó y ninguna entrada tuvo check-in.
 * - Serie: el slug sin la fecha (`seriesOf`, igual que el importador): picantearla-2026-09 →
 *   picantearla.
 */
import { seriesOf } from '$lib/utils/sheetImport.js';
import { foldText } from '$lib/server/tickets/orders.js';
import { getEventInfo } from '$lib/server/tickets/events.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * @typedef {{
 *   id: string, event_slug: string, ticket_type: string, quantity: number, total: number,
 *   payment_method: string, fondo_option: string, fondo_amount: number,
 *   fondo_contribution: number, buyer_name: string, buyer_pronouns: string | null,
 *   buyer_email: string, status: string, created_at: number, checked: number,
 *   surcharge_amount?: number
 * }} PersonOrder
 * @typedef {{ title: string, start: string | null, tags?: string[] }} EventInfo
 */

/**
 * Nombre de una serie a partir del título de un evento: "Picantearla (59ª Edición)" →
 * "Picantearla", "Club de Hosts - Erotismo y Misterio" → "Club de Hosts".
 * @param {string} title
 */
export function seriesLabel(title) {
	return title.replace(/(\s*[(:]|\s[-·–]\s).*$/, '') || title;
}

/** Estados que cuentan para personas (lo demás son intentos que no se concretaron). */
const KEPT = "('approved', 'refunded')";

/**
 * Email para agrupar: sin espacios y en minúsculas. No se sacan puntos ni "+algo" (pueden ser
 * personas distintas a propósito).
 * @param {string | null | undefined} email
 */
export function normalizeEmail(email) {
	return String(email ?? '')
		.trim()
		.toLowerCase();
}

/**
 * Id corto y estable de una persona para la URL (no se pone el email en la URL).
 * @param {string} email normalizado
 */
export async function personId(email) {
	const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kv-persona:${email}`));
	return Array.from(new Uint8Array(d).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Órdenes aprobadas y reembolsadas con cuántas entradas tuvieron check-in. Sin DNI.
 * @param {D1Database} db
 * @returns {Promise<PersonOrder[]>}
 */
export async function loadPeopleOrders(db) {
	const { results } = await db
		.prepare(
			`SELECT o.id, o.event_slug, o.ticket_type, o.quantity, o.total, o.payment_method,
				o.fondo_option, o.fondo_amount, o.fondo_contribution, o.surcharge_amount, o.buyer_name,
				o.buyer_pronouns,
				o.buyer_email, o.status, o.created_at,
				(SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id AND t.checked_in_at IS NOT NULL)
					AS checked
			FROM orders o WHERE o.status IN ${KEPT} ORDER BY o.created_at`
		)
		.all();
	return /** @type {PersonOrder[]} */ (results);
}

/**
 * Título y fecha de cada evento de las órdenes.
 * @param {PersonOrder[]} orders
 * @returns {Promise<Map<string, EventInfo>>}
 */
export async function loadEventInfo(orders) {
	const slugs = [...new Set(orders.map((o) => o.event_slug))];
	const infos = await Promise.all(slugs.map((s) => getEventInfo(s)));
	return new Map(slugs.map((s, i) => [s, infos[i] ?? { title: s, start: null, tags: [] }]));
}

/** @param {EventInfo | undefined} info */
const startMs = (info) => (info?.start ? Date.parse(info.start) : NaN);

/**
 * @typedef {{
 *   email: string, names: string[], pronouns: string[], orders: number,
 *   bought: string[], attended: string[], noShows: string[], series: string[],
 *   spent: number, firstVisit: number | null, lastVisit: number | null,
 *   firstPurchase: number, lastPurchase: number, refunded: number
 * }} Person
 */

/**
 * Agrupa las órdenes por persona. Pura (para los tests).
 *
 * @param {PersonOrder[]} orders
 * @param {Map<string, EventInfo>} events
 * @param {{ now?: number }} [opts]
 * @returns {Person[]} la de visita (o compra) más reciente primero
 */
export function groupPeople(orders, events, { now = Date.now() } = {}) {
	/** @type {Map<string, { p: Person, names: Map<string, number>, pron: Set<string>, bought: Set<string>, attended: Set<string> }>} */
	const map = new Map();
	for (const o of orders) {
		const email = normalizeEmail(o.buyer_email);
		if (!email) continue;
		let g = map.get(email);
		if (!g) {
			g = {
				p: /** @type {Person} */ ({
					email,
					orders: 0,
					spent: 0,
					refunded: 0,
					firstPurchase: o.created_at,
					lastPurchase: o.created_at
				}),
				names: new Map(),
				pron: new Set(),
				bought: new Set(),
				attended: new Set()
			};
			map.set(email, g);
		}
		const name = String(o.buyer_name ?? '').trim();
		if (name) g.names.set(name, (g.names.get(name) ?? 0) + 1);
		if (o.buyer_pronouns?.trim()) g.pron.add(o.buyer_pronouns.trim());
		g.p.orders++;
		g.p.firstPurchase = Math.min(g.p.firstPurchase, o.created_at);
		g.p.lastPurchase = Math.max(g.p.lastPurchase, o.created_at);
		if (o.status === 'refunded') {
			g.p.refunded++;
			continue;
		}
		g.p.spent += o.total;
		g.bought.add(o.event_slug);
		if (o.checked > 0) g.attended.add(o.event_slug);
	}
	/** @param {string[]} slugs */
	const byDate = (slugs) =>
		slugs.sort((a, b) => (startMs(events.get(a)) || 0) - (startMs(events.get(b)) || 0));
	const people = [...map.values()].map(({ p, names, pron, bought, attended }) => {
		const attendedList = byDate([...attended]);
		const visits = attendedList.map((s) => startMs(events.get(s))).filter(Number.isFinite);
		return {
			...p,
			// El nombre más usado primero.
			names: [...names.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
			pronouns: [...pron],
			bought: byDate([...bought]),
			attended: attendedList,
			noShows: byDate([...bought].filter((s) => !attended.has(s) && startMs(events.get(s)) < now)),
			series: [...new Set([...bought].map(seriesOf))].sort(),
			firstVisit: visits.length ? Math.min(...visits) : null,
			lastVisit: visits.length ? Math.max(...visits) : null
		};
	});
	return people.sort((a, b) => (b.lastVisit ?? b.lastPurchase) - (a.lastVisit ?? a.lastPurchase));
}

/**
 * Busca en nombre(s), email y pronombres, sin tildes ni mayúsculas.
 * @param {Person} p
 * @param {string} q
 */
export function matchesPerson(p, q) {
	const needle = foldText(q).trim();
	if (!needle) return true;
	return foldText([...p.names, p.email, ...p.pronouns].join(' ')).includes(needle);
}

/* ------------------------------------------------------------------------------------------ */
/* Notas internas (tabla person_notes, migración 0009)                                        */
/* ------------------------------------------------------------------------------------------ */

export const NOTE_MAX = 2000;

/**
 * @typedef {{ id: number, body: string, createdAt: number, createdBy: string }} PersonNote
 */

/**
 * El mail se compara sin mayúsculas ni espacios (una nota vieja guardada con otro formato
 * también aparece).
 *
 * @param {D1Database | null | undefined} db
 * @param {string} email normalizado
 * @returns {Promise<PersonNote[]>} la más nueva primero
 */
export async function listNotes(db, email) {
	if (!db) return [];
	try {
		const { results } = await db
			.prepare(
				'SELECT id, body, created_at, created_by FROM person_notes WHERE lower(trim(email)) = ?1 ORDER BY created_at DESC, id DESC'
			)
			.bind(email)
			.all();
		return results.map((r) => ({
			id: Number(r.id),
			body: String(r.body),
			createdAt: Number(r.created_at),
			createdBy: String(r.created_by)
		}));
	} catch (error) {
		if (error instanceof Error && /no such table/i.test(error.message)) return [];
		throw error;
	}
}

/**
 * Cuántas notas tiene cada persona, por mail normalizado.
 * @param {D1Database | null | undefined} db
 * @returns {Promise<Map<string, number>>}
 */
export async function noteCounts(db) {
	if (!db) return new Map();
	try {
		const { results } = await db
			.prepare(
				'SELECT lower(trim(email)) AS email, COUNT(*) AS n FROM person_notes GROUP BY lower(trim(email))'
			)
			.all();
		return new Map(results.map((r) => [String(r.email), Number(r.n)]));
	} catch (error) {
		if (error instanceof Error && /no such table/i.test(error.message)) return new Map();
		throw error;
	}
}

/**
 * Valida el texto de una nota.
 * @param {unknown} raw
 * @returns {{ ok: true, body: string } | { ok: false, error: string }}
 */
export function validateNote(raw) {
	const body = String(raw ?? '')
		.replace(/\r\n?/g, '\n')
		// eslint-disable-next-line no-control-regex -- sacar caracteres de control es la idea
		.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
		.trim();
	if (!body) return { ok: false, error: 'Escribí algo.' };
	if (body.length > NOTE_MAX) return { ok: false, error: `Hasta ${NOTE_MAX} caracteres.` };
	return { ok: true, body };
}

/**
 * @param {D1Database} db
 * @param {{ email: string, body: string, by: string, now?: number }} input
 */
export async function addNote(db, { email, body, by, now = Date.now() }) {
	const r = await db
		.prepare(
			'INSERT INTO person_notes (email, body, created_at, created_by) VALUES (?1, ?2, ?3, ?4) RETURNING id'
		)
		.bind(email, body, now, by)
		.first();
	return Number(r?.id);
}

/**
 * @param {D1Database} db
 * @param {{ email: string, id: number }} input
 */
export async function deleteNote(db, { email, id }) {
	const res = await db
		.prepare('DELETE FROM person_notes WHERE id = ?1 AND lower(trim(email)) = ?2')
		.bind(id, email)
		.run();
	return res.meta.changes === 1;
}

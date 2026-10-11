/**
 * Buscador global del panel (paleta de comandos): busca eventos, órdenes (`KV-…`, nombre o email
 * de quien compró), entradas (código corto), códigos de descuento, personas, perfiles y etiquetas
 * (también por sus alias).
 *
 * Sin distinguir mayúsculas ni tildes en todo («jose» encuentra «José», «nunez» a «Núñez»), con
 * `foldText`, la misma función que usan los eventos, las etiquetas y la búsqueda de la Puerta.
 * SQLite no ignora tildes (y `LIKE` solo ignora mayúsculas en ASCII), así que la base hace un
 * primer filtro flojo ({@link looseLike}) y la comparación de verdad se hace acá. Sin columnas
 * nuevas ni migraciones: con cientos o pocos miles de filas alcanza.
 *
 * Solo para admins (Q30). El DNI nunca sale de la base: si alguien busca por DNI, la consulta
 * devuelve solo los últimos 3 dígitos para mostrar "DNI ···123". Las búsquedas no se guardan.
 */
import { argDateList } from '$lib/utils/dates.js';
import { logDBError } from '$lib/server/db';
import { foldText, normalizeTicketCode } from '$lib/server/tickets/orders.js';
import { orderReference } from '$lib/utils/tickets.js';
import { eventLink, orderHref, personHref } from '$lib/admin/links.js';
import { eventHref } from '$lib/admin/nav.js';
import { normalizeEmail, personId } from '$lib/server/admin/people.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/eventos/index.js').EventSummary} EventSummary */

/**
 * `exact`: coincide entero con lo buscado (nombre, título, email, código o referencia, sin
 * mayúsculas ni tildes). Con alguno así, la paleta pone los registros arriba de las acciones.
 * @typedef {{ id: string, icon: string, title: string, sub: string, href: string, exact?: boolean }} SearchItem
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
 * Cuántas filas como mucho trae cada consulta para comparar acá (las más nuevas primero). Con el
 * filtro flojo casi nunca se llega; es el techo para búsquedas de puras vocales como «ana».
 */
export const MAX_CANDIDATES = 1000;

/**
 * Letras que en un nombre pueden venir con tilde, diéresis o similar (á, ü, ñ, ç, ã, ÿ…). En el
 * patrón flojo valen cualquier carácter.
 */
const LOOSE_LETTERS = /[aeiouncy]/;

/**
 * Patrón LIKE flojo para un texto ya pasado por `foldText`: cada letra que puede venir acentuada
 * (y cada carácter que no es ASCII) pasa a ser `_` (un carácter cualquiera; en SQLite cuenta
 * caracteres, no bytes), así «jose» → `%j_s_%` también trae «José» y «JOSÉ». Trae de más a
 * propósito: lo que vale es {@link foldedMatch} sobre lo que vuelve.
 * @param {string} folded
 */
export function looseLike(folded) {
	let out = '';
	for (const c of folded) {
		if (LOOSE_LETTERS.test(c) || c.charCodeAt(0) > 0x7f) out += '_';
		else out += /[\\%_]/.test(c) ? '\\' + c : c;
	}
	return `%${out}%`;
}

/**
 * Qué tan bien coincide `f` (ya pasado por `foldText`) con alguno de los campos: 0 igual, 1 al
 * comienzo, 2 al comienzo de una palabra, 3 en el medio; `-1` si no está.
 * @param {string} f
 * @param {...unknown} fields
 */
export function foldedMatch(f, ...fields) {
	let best = -1;
	for (const field of fields) {
		const v = foldText(field);
		const at = v.indexOf(f);
		if (at === -1) continue;
		const rank = v === f ? 0 : at === 0 ? 1 : /[\s@._-]/.test(v[at - 1]) ? 2 : 3;
		if (best === -1 || rank < best) best = rank;
	}
	return best;
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
		const exact = title === f || e.slug === f.replace(/\s+/g, '-');
		found.push({ e, exact, rank: at === 0 ? 0 : at > 0 ? 1 : 2 });
	}
	found.sort((a, b) => a.rank - b.rank || (b.e.start || '').localeCompare(a.e.start || ''));
	return found.slice(0, limit).map(({ e, exact }) => ({
		id: `event:${e.slug}`,
		icon: 'event',
		title: e.title,
		sub: [e.start ? e.start.slice(0, 10) : '', e.unlisted ? 'no listado' : '', e.slug]
			.filter(Boolean)
			.join(' · '),
		href: eventLink(e.slug, { tickets: ticketed.has(e.slug) }),
		...(exact ? { exact: true } : {})
	}));
}

/** Nombre del grupo de atajos a las pestañas de un evento. @param {string} title */
export const eventTabsLabel = (title) => `En «${title}»`;

/**
 * Atajos a las pestañas de un evento (el primero que encontró el buscador): Puerta, Órdenes,
 * Mail a compradores y Ventas si vende entradas, y Duplicar siempre (cargar uno nuevo a partir
 * de este, `/admin/eventos/nuevo?desde=`).
 *
 * @param {{ slug: string, title: string }} e
 * @param {{ tickets?: boolean }} [opts]
 * @returns {SearchItem[]}
 */
export function eventTabActions(e, { tickets = false } = {}) {
	/** @type {[string, string, string, string][]} */
	const tabs = tickets
		? [
				['ingreso', 'scan', 'Puerta', 'control de ingreso'],
				['ordenes', 'order', 'Órdenes', 'compras de este evento'],
				['mail', 'mail', 'Mail a compradores', 'mandar un mail a quienes compraron'],
				['ventas', 'wallet', 'Ventas', 'resumen de ventas']
			]
		: [];
	return [
		...tabs.map(([tab, icon, label, sub]) => ({
			id: `event-tab:${e.slug}:${tab}`,
			icon,
			title: label,
			sub,
			href: eventHref(e.slug, tab)
		})),
		{
			id: `event-tab:${e.slug}:duplicar`,
			icon: 'calendar-plus',
			title: 'Duplicar',
			sub: 'cargar un evento nuevo a partir de este',
			href: `/admin/eventos/nuevo?desde=${encodeURIComponent(e.slug)}`
		}
	];
}

/**
 * Etiquetas por nombre o id (el árbol en uso; anda sin base), también por sus alias: los `aka`
 * de cada etiqueta y las entradas `{ id, aliasOf }` llevan a la etiqueta de verdad. Llevan al
 * árbol de etiquetas con esa etiqueta elegida.
 *
 * @param {{ id: string, visible_name?: string, icon?: string, aliasOf?: string | null, aka?: string[] }[]} tags
 * @param {string} q
 * @param {{ limit?: number }} [opts]
 * @returns {SearchItem[]}
 */
export function searchTags(tags, q, { limit = 5 } = {}) {
	const f = foldText(q);
	if (f.length < MIN_QUERY) return [];
	const byId = new Map(tags.filter((t) => t?.id).map((t) => [t.id, t]));
	/** @type {Map<string, { t: (typeof tags)[number], rank: number, alias: string }>} */
	const found = new Map();
	/** @param {(typeof tags)[number] | undefined} t @param {number} rank @param {string} alias */
	const add = (t, rank, alias) => {
		if (!t || t.id === 'root' || t.aliasOf) return;
		const prev = found.get(t.id);
		if (!prev || rank < prev.rank) found.set(t.id, { t, rank, alias });
	};
	for (const t of tags) {
		if (!t?.id || t.id === 'root') continue;
		if (t.aliasOf) {
			// Un alias de la base: si coincide su nombre, va la etiqueta a la que apunta.
			const rank = foldedMatch(f, t.id, t.visible_name);
			if (rank !== -1) add(byId.get(t.aliasOf), rank, String(t.visible_name ?? t.id));
			continue;
		}
		const rank = foldedMatch(f, t.visible_name ?? t.id, t.id);
		if (rank !== -1) add(t, rank, '');
		for (const aka of t.aka ?? []) {
			const r = foldedMatch(f, aka);
			if (r !== -1) add(t, r, aka);
		}
	}
	return [...found.values()]
		.sort((a, b) => a.rank - b.rank || String(a.t.id).localeCompare(String(b.t.id)))
		.slice(0, limit)
		.map(({ t, rank, alias }) => ({
			id: `tag:${t.id}`,
			icon: 'tag',
			title: `${t.icon ? `${t.icon} ` : ''}${t.visible_name ?? t.id}`,
			sub: [
				'etiqueta',
				t.visible_name && t.visible_name !== t.id ? t.id : '',
				alias ? `alias: ${alias}` : ''
			]
				.filter(Boolean)
				.join(' · '),
			href: `/admin/etiquetas?etiqueta=${encodeURIComponent(t.id)}`,
			...(rank === 0 ? { exact: true } : {})
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
 * Ordena lo encontrado: primero lo que mejor coincide ({@link foldedMatch}), después en el orden
 * en que vino de la base (lo más nuevo primero).
 * @template {{ rank: number }} T
 * @param {T[]} rows
 * @param {number} limit
 */
function best(rows, limit) {
	return rows
		.map((r, i) => ({ r, i }))
		.sort((a, b) => a.r.rank - b.r.rank || a.i - b.i)
		.slice(0, limit)
		.map((x) => x.r);
}

/**
 * Registros de la base: órdenes, entradas, códigos, personas y perfiles. Cada consulta trae lo
 * que podría coincidir (con {@link looseLike}, más la referencia `KV-…`, el código de la entrada o
 * el DNI, que se comparan en SQL) y acá se queda con lo que coincide sin mayúsculas ni tildes.
 *
 * @param {D1Database | null | undefined} db
 * @param {string} q
 * @param {{ titles?: Map<string, string> }} [opts]
 * @returns {Promise<{ orders: SearchItem[], tickets: SearchItem[], codes: SearchItem[], people: SearchItem[], profiles: SearchItem[] }>}
 */
export async function searchDatabase(db, q, { titles = new Map() } = {}) {
	const empty = { orders: [], tickets: [], codes: [], people: [], profiles: [] };
	const query = q.trim().slice(0, MAX_QUERY);
	if (!db || query.length < MIN_QUERY) return empty;
	const f = foldText(query);
	const like = looseLike(f);
	const idPrefix = orderIdPrefix(query);
	const digits = query.replace(/[.\s-]/g, '');
	const dniLike = /^\d{6,}$/.test(digits) ? likeContains(digits) : '';
	const code = normalizeTicketCode(query);
	/** @param {string} slug */
	const title = (slug) => titles.get(slug) ?? slug;

	const [orders, tickets, codes, people, profiles] = await Promise.all([
		safe(db, 'órdenes', async (db) => {
			// `key_hit`: coincide por referencia o por DNI (eso no se compara acá: el DNI no sale).
			const { results } = await db
				.prepare(
					`SELECT id, event_slug, status, buyer_name, buyer_email, quantity, created_at,
						CASE WHEN ?3 != '' AND buyer_dni LIKE ?3 ESCAPE '\\' THEN substr(buyer_dni, -3) END AS dni_tail,
						((?1 != '' AND id LIKE ?1 || '%') OR (?3 != '' AND buyer_dni LIKE ?3 ESCAPE '\\')) AS key_hit
					FROM orders
					WHERE (?1 != '' AND id LIKE ?1 || '%')
						OR buyer_name LIKE ?2 ESCAPE '\\' OR buyer_email LIKE ?2 ESCAPE '\\'
						OR (?3 != '' AND buyer_dni LIKE ?3 ESCAPE '\\')
					ORDER BY key_hit DESC, created_at DESC LIMIT ?4`
				)
				.bind(idPrefix ?? '', like, dniLike, MAX_CANDIDATES)
				.all();
			const found = [];
			for (const r of results) {
				const rank = Number(r.key_hit) ? 0 : foldedMatch(f, r.buyer_name, r.buyer_email);
				if (rank !== -1) found.push({ r, rank });
			}
			return best(found, 8).map(({ r, rank }) => {
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
					href: orderHref(slug, id),
					...(rank === 0 ? { exact: true } : {})
				};
			});
		}),
		safe(db, 'entradas', async (db) => {
			const { results } = await db
				.prepare(
					`SELECT t.code, t.event_slug, t.holder_name, t.order_id, t.checked_in_at, o.status,
						(?1 != '' AND t.code = ?1) AS key_hit
					FROM tickets t JOIN orders o ON o.id = t.order_id
					WHERE (?1 != '' AND t.code = ?1) OR t.holder_name LIKE ?2 ESCAPE '\\'
					ORDER BY key_hit DESC, o.created_at DESC LIMIT ?3`
				)
				.bind(code ?? '', like, MAX_CANDIDATES)
				.all();
			const found = [];
			for (const r of results) {
				const rank = Number(r.key_hit) ? 0 : foldedMatch(f, r.holder_name);
				if (rank !== -1) found.push({ r, rank });
			}
			return best(found, 6).map(({ r, rank }) => {
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
					href: orderHref(slug, String(r.order_id)),
					...(rank === 0 ? { exact: true } : {})
				};
			});
		}),
		safe(db, 'códigos', async (db) => {
			const { results } = await db
				.prepare(
					`SELECT code, kind, value, event_slug, active FROM discount_codes
					WHERE code LIKE ?1 ESCAPE '\\' ORDER BY active DESC, created_at DESC LIMIT ?2`
				)
				.bind(like, MAX_CANDIDATES)
				.all();
			const found = [];
			for (const r of results) {
				const rank = foldedMatch(f, r.code);
				if (rank !== -1) found.push({ r, rank });
			}
			return best(found, 5).map(({ r, rank }) => ({
				id: `code:${r.code}`,
				icon: 'code',
				title: String(r.code),
				sub: [
					r.kind === 'percent' ? `${r.value} %` : `$ ${Number(r.value).toLocaleString('es-AR')}`,
					r.event_slug ? title(String(r.event_slug)) : 'todos los eventos',
					Number(r.active) ? 'activo' : 'apagado'
				].join(' · '),
				href: '/admin/ventas/codigos',
				...(rank === 0 ? { exact: true } : {})
			}));
		}),
		safe(db, 'personas', async (db) => {
			// Una fila por compra que podría coincidir; acá se agrupan por email (en minúsculas).
			const { results } = await db
				.prepare(
					`SELECT buyer_email, buyer_name, buyer_pronouns, event_slug, created_at FROM orders
					WHERE status IN ('approved', 'refunded')
						AND (buyer_name LIKE ?1 ESCAPE '\\' OR buyer_email LIKE ?1 ESCAPE '\\')
					ORDER BY created_at DESC LIMIT ?2`
				)
				.bind(like, MAX_CANDIDATES)
				.all();
			/** @type {Map<string, { r: Record<string, unknown>, email: string, n: number, rank: number }>} */
			const byEmail = new Map();
			for (const r of results) {
				const rank = foldedMatch(f, r.buyer_name, r.buyer_email);
				if (rank === -1) continue;
				const email = normalizeEmail(String(r.buyer_email));
				const p = byEmail.get(email);
				// Vienen de la más nueva a la más vieja: la primera es la última compra.
				if (p) {
					p.n++;
					p.rank = Math.min(p.rank, rank);
				} else byEmail.set(email, { r, email, n: 1, rank });
			}
			return Promise.all(
				best([...byEmail.values()], 5).map(async ({ r, email, n, rank }) => ({
					id: `person:${email}`,
					icon: 'person',
					title: r.buyer_pronouns ? `${r.buyer_name} (${r.buyer_pronouns})` : String(r.buyer_name),
					sub: `${email} · ${n} ${n === 1 ? 'compra' : 'compras'} · última: ${title(String(r.event_slug))}`,
					href: personHref(await personId(email)),
					...(rank === 0 ? { exact: true } : {})
				}))
			);
		}),
		safe(db, 'perfiles', async (db) => {
			// Perfiles de /amigues (y lugares) por nombre: al editor del perfil.
			const { results } = await db
				.prepare(
					`SELECT o.slug, o.title, s.legacy_slug FROM objects o
					LEFT JOIN profile_sources s ON s.profile_id = o.id
					WHERE o.type = 'perfil' AND o.deleted_at IS NULL AND o.title LIKE ?1 ESCAPE '\\'
					ORDER BY o.title LIMIT ?2`
				)
				.bind(like, MAX_CANDIDATES)
				.all();
			const found = [];
			for (const r of results) {
				const rank = foldedMatch(f, r.title);
				if (rank !== -1) found.push({ r, rank });
			}
			return best(found, 5).map(({ r, rank }) => {
				const slug = String(r.legacy_slug || r.slug);
				return {
					id: `profile:${slug}`,
					icon: 'profile',
					title: String(r.title),
					sub: `perfil · /amigues/${slug}`,
					href: `/admin/comunidad/perfiles/${encodeURIComponent(slug)}`,
					...(rank === 0 ? { exact: true } : {})
				};
			});
		})
	]);
	return { orders, tickets, codes, people, profiles };
}

/**
 * Todos los grupos de resultados, en el orden en que se muestran (los vacíos no van).
 *
 * @param {{ events: SearchItem[], eventTabs?: SearchItem[], eventTabsLabel?: string, orders: SearchItem[], tickets: SearchItem[], codes: SearchItem[], people: SearchItem[], profiles?: SearchItem[], tags?: SearchItem[] }} r
 * @returns {SearchGroup[]}
 */
export function groupResults(r) {
	return [
		{ id: 'events', label: 'Eventos', items: r.events },
		{ id: 'event-tabs', label: r.eventTabsLabel ?? 'En el evento', items: r.eventTabs ?? [] },
		{ id: 'orders', label: 'Órdenes', items: r.orders },
		{ id: 'people', label: 'Personas', items: r.people },
		{ id: 'profiles', label: 'Perfiles', items: r.profiles ?? [] },
		{ id: 'tags', label: 'Etiquetas', items: r.tags ?? [] },
		{ id: 'tickets', label: 'Entradas', items: r.tickets },
		{ id: 'codes', label: 'Códigos de descuento', items: r.codes }
	].filter((g) => g.items.length);
}

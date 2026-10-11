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
 * Entiende los operadores de `$lib/utils/searchQuery.js` (`#etiqueta`, `@persona`, `e:evento`,
 * `orden:`, `estado:`, `tipo:`, `lugar:`, `hoy`/`semana`/`finde`, `"frase"`, `-palabra`): cada
 * función recibe lo escrito o lo ya leído (`ParsedQuery`).
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
import {
	allowsKind,
	eventInWhen,
	foldQuery,
	foldedRank,
	hasRecordCriteria,
	matchTerms,
	parseSearchQuery
} from '$lib/utils/searchQuery.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/server/eventos/index.js').EventSummary} EventSummary */
/** @typedef {import('$lib/utils/searchQuery.js').ParsedQuery} ParsedQuery */
/** @typedef {{ id: string, visible_name?: string, icon?: string, aliasOf?: string | null, aka?: string[] }} TagNode */

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
	return foldedRank(f, fields.map(foldText));
}

/**
 * Lo escrito ya leído (si viene un texto, lo lee acá).
 * @param {string | ParsedQuery} q
 * @returns {ParsedQuery}
 */
export function asQuery(q) {
	return typeof q === 'string' ? parseSearchQuery(q.trim().slice(0, MAX_QUERY)) : q;
}

/**
 * Los nombres (sin tildes) con que un evento puede tener la etiqueta pedida: lo escrito, y si
 * es el id, el nombre o un alias de una etiqueta del árbol, todos los de esa etiqueta. Si
 * ninguna se llama exactamente así, las que empiezan así (`#shib` → shibari).
 *
 * @param {TagNode[]} tags
 * @param {string} value ya sin tildes
 * @returns {Set<string>}
 */
export function tagFilterNames(tags, value) {
	const names = new Set([value]);
	const byId = new Map(tags.filter((t) => t?.id).map((t) => [t.id, t]));
	/** @type {Map<string, TagNode>} */
	const exact = new Map();
	/** @type {Map<string, TagNode>} */
	const prefix = new Map();
	for (const t of tags) {
		if (!t?.id || t.id === 'root') continue;
		const target = t.aliasOf ? byId.get(t.aliasOf) : t;
		if (!target || target.aliasOf) continue;
		const rank = foldedRank(value, [t.id, t.visible_name ?? '', ...(t.aka ?? [])].map(foldQuery));
		if (rank === 0) exact.set(target.id, target);
		else if (rank === 1) prefix.set(target.id, target);
	}
	const chosen = exact.size ? exact : prefix;
	for (const t of chosen.values()) {
		for (const n of [t.id, t.visible_name ?? '', ...(t.aka ?? [])]) if (n) names.add(foldQuery(n));
		for (const a of tags) {
			if (a?.aliasOf === t.id)
				for (const n of [a.id, a.visible_name ?? '']) if (n) names.add(foldQuery(n));
		}
	}
	return names;
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
 * Primero los que mejor coinciden, después los más nuevos. Con fecha pedida (`hoy`, `semana`…),
 * del más próximo al más lejano. Filtra por etiqueta (`#…`, también por alias; hace falta
 * `tags`, el árbol), lugar (`lugar:`) y fecha.
 *
 * @param {(EventSummary & { tags?: string[] })[]} events
 * @param {string | ParsedQuery} q
 * @param {{ limit?: number, ticketed?: Set<string>, tags?: TagNode[], now?: number }} [opts]
 * @returns {SearchItem[]}
 */
export function searchEvents(events, q, { limit = 6, ticketed = new Set(), tags = [], now } = {}) {
	const pq = asQuery(q);
	if (!allowsKind(pq, 'events') || !hasRecordCriteria(pq)) return [];
	const wanted = pq.tags.map((v) => tagFilterNames(tags, v));
	const unwanted = pq.excludeTags.map((v) => tagFilterNames(tags, v));
	const joined = [...pq.words, ...pq.phrases].join(' ');
	const found = [];
	for (const e of events) {
		if (pq.when && !eventInWhen(e, pq.when, now)) continue;
		const location = foldQuery(e.location);
		if (!pq.places.every((p) => location.includes(p))) continue;
		if (wanted.length || unwanted.length) {
			const own = (e.tags ?? []).map(foldQuery);
			if (!wanted.every((names) => own.some((t) => names.has(t)))) continue;
			if (unwanted.some((names) => own.some((t) => names.has(t)))) continue;
		}
		const rank = matchTerms(pq, e.title, e.slug, e.slug.replace(/-/g, ' '));
		if (rank === -1) continue;
		const exact =
			Boolean(joined) && (foldQuery(e.title) === joined || e.slug === joined.replace(/\s+/g, '-'));
		found.push({ e, exact, rank });
	}
	const soonest = Boolean(pq.when);
	found.sort(
		(a, b) =>
			a.rank - b.rank ||
			(soonest
				? (a.e.start || '').localeCompare(b.e.start || '')
				: (b.e.start || '').localeCompare(a.e.start || ''))
	);
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
 * Con `tab` (`e:latex puerta`), solo esa pestaña, marcada como `exact` (va arriba de todo).
 *
 * @param {{ slug: string, title: string }} e
 * @param {{ tickets?: boolean, tab?: string | null }} [opts]
 * @returns {SearchItem[]}
 */
export function eventTabActions(e, { tickets = false, tab = null } = {}) {
	/** @type {[string, string, string, string][]} */
	const tabs = tickets
		? [
				['ingreso', 'scan', 'Puerta', 'control de ingreso'],
				['ordenes', 'order', 'Órdenes', 'compras de este evento'],
				['mail', 'mail', 'Mail a compradores', 'mandar un mail a quienes compraron'],
				['ventas', 'wallet', 'Ventas', 'resumen de ventas']
			]
		: [];
	/** @type {SearchItem[]} */
	const all = [
		...tabs.map(([id, icon, label, sub]) => ({
			id: `event-tab:${e.slug}:${id}`,
			icon,
			title: label,
			sub,
			href: eventHref(e.slug, id)
		})),
		{
			id: `event-tab:${e.slug}:duplicar`,
			icon: 'calendar-plus',
			title: 'Duplicar',
			sub: 'cargar un evento nuevo a partir de este',
			href: `/admin/eventos/nuevo?desde=${encodeURIComponent(e.slug)}`
		}
	];
	if (!tab) return all;
	return all
		.filter((item) => item.id === `event-tab:${e.slug}:${tab}`)
		.map((item) => ({ ...item, exact: true }));
}

/**
 * Etiquetas por nombre o id (el árbol en uso; anda sin base), también por sus alias: los `aka`
 * de cada etiqueta y las entradas `{ id, aliasOf }` llevan a la etiqueta de verdad. Llevan al
 * árbol de etiquetas con esa etiqueta elegida.
 *
 * Con `#…`/`etiqueta:…` busca eso (y no el resto del texto, que es para los eventos); sin las
 * que dicen algo excluido (`-palabra`).
 *
 * @param {TagNode[]} tags
 * @param {string | ParsedQuery} q
 * @param {{ limit?: number }} [opts]
 * @returns {SearchItem[]}
 */
export function searchTags(tags, q, { limit = 5 } = {}) {
	const pq = asQuery(q);
	if (!allowsKind(pq, 'tags')) return [];
	const f = pq.tags.length ? pq.tags[0] : [...pq.words, ...pq.phrases].join(' ');
	if (f.length < MIN_QUERY && !(pq.tags.length && f)) return [];
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
	// `-palabra` también vale para las etiquetas.
	const shown = [...found.values()].filter(
		({ t }) => !pq.exclude.some((x) => [t.id, t.visible_name].some((n) => foldText(n).includes(x)))
	);
	return shown
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
 * @param {boolean} enabled si es `false`, ni pregunta (devuelve `[]`)
 * @param {(db: D1Database) => Promise<T[]>} fn
 * @returns {Promise<T[]>}
 */
async function safe(db, what, enabled, fn) {
	if (!enabled) return [];
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
 * Con operadores: cada grupo se busca solo si `tipo:` (o `@`, `orden:`…) lo deja, y
 * `estado:` filtra las órdenes (sin texto, trae las últimas en ese estado).
 *
 * @param {D1Database | null | undefined} db
 * @param {string | ParsedQuery} q
 * @param {{ titles?: Map<string, string> }} [opts]
 * @returns {Promise<{ orders: SearchItem[], tickets: SearchItem[], codes: SearchItem[], people: SearchItem[], profiles: SearchItem[] }>}
 */
export async function searchDatabase(db, q, { titles = new Map() } = {}) {
	const empty = { orders: [], tickets: [], codes: [], people: [], profiles: [] };
	const pq = asQuery(q);
	if (!db || !hasRecordCriteria(pq)) return empty;
	const terms = [...pq.words, ...pq.phrases];
	// El filtro flojo de la base, con el pedazo más largo (los demás se comparan acá).
	const longest = terms.reduce((a, b) => (b.length > a.length ? b : a), '');
	const hasTerms = longest.length > 0;
	const like = looseLike(longest);
	const query = pq.text.slice(0, MAX_QUERY);
	const idPrefix = orderIdPrefix(query);
	const digits = query.replace(/[.\s-]/g, '');
	const dniLike = /^\d{6,}$/.test(digits) ? likeContains(digits) : '';
	const code = query ? normalizeTicketCode(query) : null;
	/** @param {string} slug */
	const title = (slug) => titles.get(slug) ?? slug;
	/** Lo buscado no tiene que estar en ninguno de estos (con `-palabra`). @param {...unknown} fields */
	const excluded = (...fields) =>
		pq.exclude.length > 0 &&
		fields.map(foldText).some((v) => pq.exclude.some((x) => v.includes(x)));
	/** @param {import('$lib/utils/searchQuery.js').SearchKind} kind @param {boolean} [needsTerms] */
	const wants = (kind, needsTerms = true) => allowsKind(pq, kind) && (hasTerms || !needsTerms);
	const status = pq.status ?? '';

	const [orders, tickets, codes, people, profiles] = await Promise.all([
		safe(db, 'órdenes', wants('orders', !status), async (db) => {
			// `key_hit`: coincide por referencia o por DNI (eso no se compara acá: el DNI no sale).
			const { results } = await db
				.prepare(
					`SELECT id, event_slug, status, buyer_name, buyer_email, quantity, created_at,
						CASE WHEN ?3 != '' AND buyer_dni LIKE ?3 ESCAPE '\\' THEN substr(buyer_dni, -3) END AS dni_tail,
						((?1 != '' AND id LIKE ?1 || '%') OR (?3 != '' AND buyer_dni LIKE ?3 ESCAPE '\\')) AS key_hit
					FROM orders
					WHERE (?5 = '' OR status = ?5) AND (
						(?1 != '' AND id LIKE ?1 || '%')
						OR buyer_name LIKE ?2 ESCAPE '\\' OR buyer_email LIKE ?2 ESCAPE '\\'
						OR (?3 != '' AND buyer_dni LIKE ?3 ESCAPE '\\'))
					ORDER BY key_hit DESC, created_at DESC LIMIT ?4`
				)
				.bind(idPrefix ?? '', like, dniLike, MAX_CANDIDATES, status)
				.all();
			const found = [];
			for (const r of results) {
				if (excluded(r.buyer_name, r.buyer_email)) continue;
				const rank = Number(r.key_hit) ? 0 : matchTerms(pq, r.buyer_name, r.buyer_email);
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
		safe(db, 'entradas', wants('tickets'), async (db) => {
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
				if (excluded(r.holder_name)) continue;
				const rank = Number(r.key_hit) ? 0 : matchTerms(pq, r.holder_name);
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
		safe(db, 'códigos', wants('codes'), async (db) => {
			const { results } = await db
				.prepare(
					`SELECT code, kind, value, event_slug, active FROM discount_codes
					WHERE code LIKE ?1 ESCAPE '\\' ORDER BY active DESC, created_at DESC LIMIT ?2`
				)
				.bind(like, MAX_CANDIDATES)
				.all();
			const found = [];
			for (const r of results) {
				const rank = matchTerms(pq, r.code);
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
		safe(db, 'personas', wants('people'), async (db) => {
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
				const rank = matchTerms(pq, r.buyer_name, r.buyer_email);
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
		safe(db, 'perfiles', wants('profiles'), async (db) => {
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
				const rank = matchTerms(pq, r.title);
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
 * Con una pestaña pedida (`e:latex puerta`), su atajo va primero.
 *
 * @param {{ events: SearchItem[], eventTabs?: SearchItem[], eventTabsLabel?: string, tabFirst?: boolean, orders: SearchItem[], tickets: SearchItem[], codes: SearchItem[], people: SearchItem[], profiles?: SearchItem[], tags?: SearchItem[] }} r
 * @returns {SearchGroup[]}
 */
export function groupResults(r) {
	const events = { id: 'events', label: 'Eventos', items: r.events };
	const tabs = {
		id: 'event-tabs',
		label: r.eventTabsLabel ?? 'En el evento',
		items: r.eventTabs ?? []
	};
	return [
		...(r.tabFirst ? [tabs, events] : [events, tabs]),
		{ id: 'orders', label: 'Órdenes', items: r.orders },
		{ id: 'people', label: 'Personas', items: r.people },
		{ id: 'profiles', label: 'Perfiles', items: r.profiles ?? [] },
		{ id: 'tags', label: 'Etiquetas', items: r.tags ?? [] },
		{ id: 'tickets', label: 'Entradas', items: r.tickets },
		{ id: 'codes', label: 'Códigos de descuento', items: r.codes }
	].filter((g) => g.items.length);
}

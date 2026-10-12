/**
 * Lo que muestra Estadísticas → Bot de Telegram (`/admin/estadisticas/bot`, solo admins) de las
 * estadísticas de uso del bot (uso.js, decisión 0045):
 *
 * - **Personas**: quién usó el bot en el período (7, 30 o 90 días), cuántas interacciones en total
 *   y el último día. Si su Telegram está vinculado a una cuenta del sitio (`telegram_chats`) o a
 *   une admin (`telegram_admin_links`), eso; si no, el nombre de Telegram. Nada de qué hizo.
 * - **Por semana**: los totales por tipo de las últimas {@link USO_WEEKS} semanas (siempre).
 * - **El detalle de una semana**: pantallas, comandos y lo demás por clave; lo buscado y las cosas
 *   solo desde {@link USO_MIN_COUNT} veces (filtrado **en la consulta**: lo de menos ni sale de la
 *   base, solo su suma en «otras»). Y solo si esa semana usaron el bot al menos
 *   {@link USO_MIN_PEOPLE} personas: con menos, el detalle sería de alguien que la lista de arriba
 *   nombra, así que no sale de la base.
 */
import {
	USO_MIN_COUNT,
	USO_MIN_PEOPLE,
	USO_TIPOS,
	arDay,
	isWeek,
	objectKey,
	recentWeeks,
	weekRange
} from './uso.js';
import { accountHref } from '$lib/admin/links.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Cuántas semanas se muestran (las filas por persona duran 180 días: el umbral se puede mirar). */
export const USO_WEEKS = 12;

/** Hasta cuántas personas lista el panel. */
const PEOPLE_MAX = 500;

/** Hasta cuántas búsquedas o cosas por tipo. */
const DETAIL_MAX = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Los tipos cuyo detalle es lo buscado o una cosa (con el umbral). */
const DETAIL_TIPOS = Object.keys(USO_TIPOS).filter((t) => USO_TIPOS[t].detalle);
/** Los demás (pantallas, comandos, Mini App, seguir, vincular): sin umbral. */
const PLAIN_TIPOS = Object.keys(USO_TIPOS).filter((t) => !USO_TIPOS[t].detalle);

/** Las secciones del bot (nav.js `SectionId`). */
const SECTIONS = /** @type {Record<string, string>} */ ({
	m: 'Material',
	w: 'Kinkipedia',
	a: 'Amigues',
	s: 'Series'
});

/** Cómo se llama cada pantalla en el panel (las claves de usoUpdate.js `screenKey`). */
const SCREENS = /** @type {Record<string, string>} */ ({
	home: 'Inicio',
	'list:d': 'Hoy',
	'list:w': 'Semana',
	'list:f': 'Finde',
	'list:p': 'Próximos',
	event: 'Tarjeta de un evento',
	search: 'Buscar',
	search_cancel: 'Cancelar la búsqueda',
	sigo: 'Lo que sigo',
	fondo: 'Fondo',
	help: 'Ayuda',
	follow: 'Seguir: opciones',
	follow_do: 'Seguir algo',
	site_results: 'Resultados de una búsqueda',
	site_doc: 'Una cosa de una búsqueda',
	search_follow: 'Seguir desde una búsqueda',
	tickets: 'Mis entradas',
	ticket: 'Una entrada',
	admin: 'Admins (Estado y avisos)'
});

/** Lo demás que no es una pantalla ni un comando. */
const OTHER_LABELS = /** @type {Record<string, string>} */ ({
	'miniapp:calendario': 'Calendario',
	'seguir:tarjeta': 'Desde la tarjeta de un evento',
	'seguir:busqueda': 'Desde una búsqueda sin resultados',
	'vincular:cuenta': 'Una cuenta del sitio',
	'vincular:admin': 'Une admin',
	'desvincular:cuenta': 'Una cuenta del sitio'
});

/**
 * El nombre de una clave sin umbral en el panel: la pantalla, `/comando` o lo demás.
 *
 * @param {string} tipo
 * @param {string} clave
 */
export function keyLabel(tipo, clave) {
	if (tipo === 'comando') return clave.startsWith('(') ? 'Otros comandos' : `/${clave}`;
	if (tipo === 'pantalla') {
		if (SCREENS[clave]) return SCREENS[clave];
		const [screen, section] = clave.split(':');
		const name = SECTIONS[section] ?? section;
		if (screen === 'section') return name;
		if (screen === 'section_tags') return `${name}: filtrar por etiqueta`;
		if (screen === 'section_doc') return `${name}: una cosa`;
		return clave;
	}
	return OTHER_LABELS[`${tipo}:${clave}`] ?? clave;
}

/** `?3, ?4, …` para una lista de valores que empieza en el parámetro `from`. */
const params = (/** @type {number} */ n, /** @type {number} */ from) =>
	Array.from({ length: n }, (_, i) => `?${from + i}`).join(', ');

/**
 * @typedef {{ name: string, username: string, account: { label: string, href: string } | null,
 *   admin: string | null, total: number, lastDay: string }} UsoPersonRow
 * @typedef {{ clave: string, n: number, title?: string, href?: string }} UsoKeyRow
 * @typedef {{ items: UsoKeyRow[], otherN: number, otherKeys: number }} UsoDetailList
 * @typedef {{ week: string, from: string, to: string, people: number,
 *   totals: Record<string, number> }} UsoWeekRow
 * @typedef {{ available: true, people: UsoPersonRow[], weeks: UsoWeekRow[], week: string,
 *   tipos: { id: string, label: string, detalle: boolean }[],
 *   detail: { hidden: true, people: number }
 *     | { hidden: false, people: number, plain: Record<string, UsoKeyRow[]>,
 *       lists: Record<string, UsoDetailList> } }
 *   | { available: false }} BotUsage
 */

/**
 * Las personas del período. Sin el id de Telegram (el panel no lo necesita).
 *
 * @param {D1Database} db
 * @param {string} fromDay
 * @returns {Promise<UsoPersonRow[]>}
 */
async function loadPeople(db, fromDay) {
	// Con un solo MAX(), SQLite toma `nombre` y `usuario` de la fila del último día.
	const { results } = await db
		.prepare(
			`SELECT SUM(p.interacciones) AS total, MAX(p.dia) AS ultimo, p.nombre, p.usuario,
				a.id AS account_id, a.email AS account_email, al.github_login AS admin_login
			FROM telegram_uso_personas p
			LEFT JOIN telegram_chats c ON c.chat_id = p.telegram_id
			LEFT JOIN accounts a ON a.id = c.account_id AND a.deleted_at IS NULL
			LEFT JOIN telegram_admin_links al ON al.telegram_user_id = p.telegram_id
			WHERE p.dia >= ?1
			GROUP BY p.telegram_id
			ORDER BY total DESC
			LIMIT ?2`
		)
		.bind(fromDay, PEOPLE_MAX)
		.all();
	return results.map((r) => ({
		name: String(r.nombre ?? ''),
		username: String(r.usuario ?? ''),
		account:
			r.account_id && r.account_email
				? { label: String(r.account_email), href: accountHref(String(r.account_id)) }
				: null,
		admin: r.admin_login ? String(r.admin_login) : null,
		total: Number(r.total) || 0,
		lastDay: String(r.ultimo ?? '')
	}));
}

/**
 * Los totales por semana y tipo, y cuántas personas usaron el bot cada semana.
 *
 * @param {D1Database} db
 * @param {string[]} weeks de la más nueva a la más vieja
 * @returns {Promise<UsoWeekRow[]>}
 */
async function loadWeeks(db, weeks) {
	const ranges = weeks.map((w) => ({ week: w, ...weekRange(w) }));
	const [totals, ...counts] = await db.batch([
		db
			.prepare(
				`SELECT semana, tipo, SUM(n) AS n FROM telegram_uso_totales
				WHERE semana >= ?1 AND semana <= ?2 GROUP BY semana, tipo`
			)
			.bind(weeks[weeks.length - 1], weeks[0]),
		...ranges.map((r) =>
			db
				.prepare(
					`SELECT COUNT(DISTINCT telegram_id) AS n FROM telegram_uso_personas
					WHERE dia >= ?1 AND dia <= ?2`
				)
				.bind(r.from, r.to)
		)
	]);
	/** @type {Map<string, Record<string, number>>} */
	const byWeek = new Map(weeks.map((w) => [w, {}]));
	for (const r of /** @type {any[]} */ (totals.results ?? [])) {
		const row = byWeek.get(String(r.semana));
		if (row) row[String(r.tipo)] = Number(r.n) || 0;
	}
	return ranges.map((r, i) => ({
		...r,
		people: Number(/** @type {any} */ (counts[i]?.results?.[0])?.n) || 0,
		totals: byWeek.get(r.week) ?? {}
	}));
}

/**
 * El detalle de una semana con al menos {@link USO_MIN_PEOPLE} personas. Lo buscado y las cosas
 * con menos de {@link USO_MIN_COUNT} veces **no salen de la base**: la consulta trae solo su suma.
 *
 * @param {D1Database} db
 * @param {string} week
 * @param {(keys: string[]) => Promise<Map<string, { title: string, href: string }>>} [titles]
 */
export async function loadWeekDetail(db, week, titles) {
	const [plain, detail, other] = await db.batch([
		db
			.prepare(
				`SELECT tipo, clave, n FROM telegram_uso_totales
				WHERE semana = ?1 AND tipo IN (${params(PLAIN_TIPOS.length, 2)})
				ORDER BY n DESC, clave`
			)
			.bind(week, ...PLAIN_TIPOS),
		db
			.prepare(
				`SELECT tipo, clave, n FROM telegram_uso_totales
				WHERE semana = ?1 AND n >= ?2 AND tipo IN (${params(DETAIL_TIPOS.length, 3)})
				ORDER BY n DESC, clave`
			)
			.bind(week, USO_MIN_COUNT, ...DETAIL_TIPOS),
		db
			.prepare(
				`SELECT tipo, SUM(n) AS n, COUNT(*) AS claves FROM telegram_uso_totales
				WHERE semana = ?1 AND n < ?2 AND tipo IN (${params(DETAIL_TIPOS.length, 3)})
				GROUP BY tipo`
			)
			.bind(week, USO_MIN_COUNT, ...DETAIL_TIPOS)
	]);
	/** @type {Record<string, UsoKeyRow[]>} */
	const plainOut = Object.fromEntries(PLAIN_TIPOS.map((t) => [t, []]));
	for (const r of /** @type {any[]} */ (plain.results ?? [])) {
		const tipo = String(r.tipo);
		const clave = String(r.clave);
		plainOut[tipo]?.push({ clave, n: Number(r.n) || 0, title: keyLabel(tipo, clave) });
	}
	/** @type {Record<string, UsoDetailList>} */
	const lists = Object.fromEntries(
		DETAIL_TIPOS.map((t) => [t, { items: [], otherN: 0, otherKeys: 0 }])
	);
	for (const r of /** @type {any[]} */ (detail.results ?? [])) {
		const list = lists[String(r.tipo)];
		// La consulta ya filtra; esto solo cuida que nunca pase algo de menos.
		if (list && Number(r.n) >= USO_MIN_COUNT && list.items.length < DETAIL_MAX) {
			list.items.push({ clave: String(r.clave), n: Number(r.n) });
		}
	}
	for (const r of /** @type {any[]} */ (other.results ?? [])) {
		const list = lists[String(r.tipo)];
		if (list) {
			list.otherN = Number(r.n) || 0;
			list.otherKeys = Number(r.claves) || 0;
		}
	}
	const objectKeys = [...lists.objeto.items, ...lists.inline_elegido.items].map((i) => i.clave);
	if (titles && objectKeys.length) {
		try {
			const map = await titles([...new Set(objectKeys)]);
			for (const list of [lists.objeto, lists.inline_elegido]) {
				for (const item of list.items) Object.assign(item, map.get(item.clave) ?? {});
			}
		} catch {
			// Sin títulos: la clave sola.
		}
	}
	return { plain: plainOut, lists };
}

/**
 * Los títulos de las cosas, del índice público de la búsqueda (inlineSource.js): una cosa que dejó
 * de ser pública queda con su clave sola.
 *
 * @param {import('./inline.js').InlineSource | null} source
 * @returns {(keys: string[]) => Promise<Map<string, { title: string, href: string }>>}
 */
export function titlesFromSource(source) {
	return async (keys) => {
		const wanted = new Set(keys);
		/** @type {Map<string, { title: string, href: string }>} */
		const out = new Map();
		for (const doc of source?.docs ?? []) {
			const key = objectKey(doc, source);
			if (key && wanted.has(key) && !out.has(key)) out.set(key, { title: doc.t, href: doc.h });
		}
		return out;
	};
}

/**
 * Todo lo del panel. Sin las tablas (migración 0057 sin aplicar): `{ available: false }`.
 *
 * @param {D1Database} db
 * @param {{ days: number, week?: string | null, now?: number,
 *   titles?: (keys: string[]) => Promise<Map<string, { title: string, href: string }>> }} opts
 * @returns {Promise<BotUsage>}
 */
export async function loadBotUsage(db, { days, week = null, now = Date.now(), titles }) {
	const weeks = recentWeeks(now, USO_WEEKS);
	const chosen = week && isWeek(week) && weeks.includes(week) ? week : weeks[0];
	const fromDay = arDay(now - (days - 1) * DAY_MS);
	const [people, weekRows] = await Promise.all([loadPeople(db, fromDay), loadWeeks(db, weeks)]);
	const peopleThatWeek = weekRows.find((w) => w.week === chosen)?.people ?? 0;
	const detail =
		peopleThatWeek >= USO_MIN_PEOPLE
			? {
					hidden: /** @type {const} */ (false),
					people: peopleThatWeek,
					...(await loadWeekDetail(db, chosen, titles))
				}
			: { hidden: /** @type {const} */ (true), people: peopleThatWeek };
	const tipos = Object.entries(USO_TIPOS).map(([id, t]) => ({
		id,
		label: t.label,
		detalle: Boolean(t.detalle)
	}));
	return { available: true, people, weeks: weekRows, week: chosen, tipos, detail };
}

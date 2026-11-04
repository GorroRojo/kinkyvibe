/**
 * La cuenta de cada evento en la base (migración 0075; docs/tickets.md, «Gastos y reparto»):
 * lo cargado a mano (`event_accounts`), el cierre con su resumen (`event_account_closings`) y la
 * regla por defecto de cada lugar (`venue_cost_rules`). La cuenta en sí la hace
 * src/lib/admin/reparto.js. Interruptor `gastos_reparto`.
 *
 * Nunca guarda alias, CBU ni CVU: «quién pagó» y «quién la tiene» son nombres.
 */
import { cleanAccount, cleanVenueRule } from '$lib/admin/reparto.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/admin/reparto.js').AccountData} AccountData */
/** @typedef {import('$lib/admin/reparto.js').ClosingSummary} ClosingSummary */

/**
 * @param {string} s
 * @returns {unknown}
 */
function parse(s) {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

/**
 * Lo guardado de la cuenta de un evento, o `null` si todavía no se guardó nada.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<{ data: AccountData, version: number, updatedAt: number, updatedBy: string } | null>}
 */
export async function getAccount(db, slug) {
	const row = await db
		.prepare(
			'SELECT data, version, updated_at, updated_by FROM event_accounts WHERE event_slug = ?1'
		)
		.bind(slug)
		.first();
	if (!row) return null;
	return {
		data: cleanAccount(parse(String(row.data))),
		version: Number(row.version),
		updatedAt: Number(row.updated_at),
		updatedBy: String(row.updated_by)
	};
}

/**
 * Guarda la cuenta de un evento. `version` es la que se abrió (0 si no había nada): si otre admin
 * guardó en el medio, no pisa y devuelve `conflict`. No guarda si la cuenta está cerrada.
 *
 * @param {D1Database} db
 * @param {{ slug: string, data: AccountData, version: number, by: string, now?: number }} input
 * @returns {Promise<{ ok: true, version: number } | { ok: false, reason: 'conflict' | 'closed' }>}
 */
export async function saveAccount(db, { slug, data, version, by, now = Date.now() }) {
	if (await getClosing(db, slug)) return { ok: false, reason: 'closed' };
	const json = JSON.stringify(cleanAccount(data));
	if (version === 0) {
		const r = await db
			.prepare(
				`INSERT INTO event_accounts (event_slug, data, version, created_at, created_by, updated_at, updated_by)
				VALUES (?1, ?2, 1, ?3, ?4, ?3, ?4) ON CONFLICT (event_slug) DO NOTHING`
			)
			.bind(slug, json, now, by)
			.run();
		return r.meta.changes ? { ok: true, version: 1 } : { ok: false, reason: 'conflict' };
	}
	const r = await db
		.prepare(
			`UPDATE event_accounts SET data = ?2, version = version + 1, updated_at = ?3, updated_by = ?4
			WHERE event_slug = ?1 AND version = ?5`
		)
		.bind(slug, json, now, by, version)
		.run();
	return r.meta.changes ? { ok: true, version: version + 1 } : { ok: false, reason: 'conflict' };
}

/**
 * @typedef {ClosingSummary & {
 *   event_slug: string, event_title: string, event_date: string,
 *   closed_at: number, closed_by: string
 * }} ClosingRow
 */

const SUMMARY_COLUMNS = /** @type {const} */ ([
	'tickets',
	'presale',
	'door',
	'fondo_net',
	'other_income',
	'income_total',
	'venue',
	'fees',
	'other_expenses',
	'expenses_total',
	'caja',
	'profit'
]);

/** @param {Record<string, unknown>} row @returns {ClosingRow} */
function closingRow(row) {
	return /** @type {ClosingRow} */ ({
		event_slug: String(row.event_slug),
		event_title: String(row.event_title),
		event_date: String(row.event_date),
		...Object.fromEntries(SUMMARY_COLUMNS.map((k) => [k, Number(row[k]) || 0])),
		closed_at: Number(row.closed_at),
		closed_by: String(row.closed_by)
	});
}

/**
 * El cierre de la cuenta de un evento (con la foto de la cuenta), o `null` si está abierta.
 *
 * @param {D1Database} db
 * @param {string} slug
 * @returns {Promise<(ClosingRow & { snapshot: unknown }) | null>}
 */
export async function getClosing(db, slug) {
	const row = await db
		.prepare('SELECT * FROM event_account_closings WHERE event_slug = ?1')
		.bind(slug)
		.first();
	if (!row) return null;
	return { ...closingRow(row), snapshot: parse(String(row.snapshot)) };
}

/**
 * Cierra la cuenta: guarda el resumen y la foto. `false` si ya estaba cerrada.
 *
 * @param {D1Database} db
 * @param {{ slug: string, title: string, date: string, summary: ClosingSummary, snapshot: unknown, by: string, now?: number }} input
 */
export async function closeAccount(
	db,
	{ slug, title, date, summary, snapshot, by, now = Date.now() }
) {
	const cols = [
		'event_slug',
		'event_title',
		'event_date',
		...SUMMARY_COLUMNS,
		'snapshot',
		'closed_at',
		'closed_by'
	];
	const values = [
		slug,
		title,
		date,
		...SUMMARY_COLUMNS.map((k) => Math.round(Number(summary[k]) || 0)),
		JSON.stringify(snapshot),
		now,
		by
	];
	const r = await db
		.prepare(
			`INSERT INTO event_account_closings (${cols.join(', ')})
			VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')}) ON CONFLICT (event_slug) DO NOTHING`
		)
		.bind(...values)
		.run();
	return Boolean(r.meta.changes);
}

/**
 * Reabre la cuenta (borra el cierre). `false` si no estaba cerrada.
 * @param {D1Database} db
 * @param {string} slug
 */
export async function reopenAccount(db, slug) {
	const r = await db
		.prepare('DELETE FROM event_account_closings WHERE event_slug = ?1')
		.bind(slug)
		.run();
	return Boolean(r.meta.changes);
}

/**
 * Los cierres de un año (por el día del evento), del más viejo al más nuevo.
 * @param {D1Database} db
 * @param {number} year
 * @returns {Promise<ClosingRow[]>}
 */
export async function listClosings(db, year) {
	const { results } = await db
		.prepare(
			`SELECT ${['event_slug', 'event_title', 'event_date', ...SUMMARY_COLUMNS, 'closed_at', 'closed_by'].join(', ')}
			FROM event_account_closings WHERE event_date >= ?1 AND event_date < ?2
			ORDER BY event_date, event_slug`
		)
		.bind(`${year}-01-01`, `${year + 1}-01-01`)
		.all();
	return results.map((r) => closingRow(/** @type {Record<string, unknown>} */ (r)));
}

/**
 * Los años con algún cierre, del más nuevo al más viejo.
 * @param {D1Database} db
 * @returns {Promise<number[]>}
 */
export async function closingYears(db) {
	const { results } = await db
		.prepare(
			`SELECT DISTINCT substr(event_date, 1, 4) AS y FROM event_account_closings ORDER BY y DESC`
		)
		.all();
	return results.map((r) => Number(r.y)).filter((y) => Number.isInteger(y) && y > 2000);
}

/**
 * La regla por defecto de un lugar (el id de su perfil), o `null`.
 * @param {D1Database} db
 * @param {number} venueId
 */
export async function getVenueRule(db, venueId) {
	const row = await db
		.prepare('SELECT rule FROM venue_cost_rules WHERE venue_id = ?1')
		.bind(venueId)
		.first();
	return row ? cleanVenueRule(parse(String(row.rule))) : null;
}

/**
 * Guarda la regla por defecto de un lugar. Las horas no: se cargan en cada evento.
 * @param {D1Database} db
 * @param {{ venueId: number, rule: import('$lib/admin/reparto.js').VenueRule, by: string, now?: number }} input
 */
export async function saveVenueRule(db, { venueId, rule, by, now = Date.now() }) {
	const clean = cleanVenueRule(rule);
	if (!clean) return false;
	delete clean.hours;
	await db
		.prepare(
			`INSERT INTO venue_cost_rules (venue_id, rule, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (venue_id) DO UPDATE SET rule = excluded.rule, updated_at = excluded.updated_at,
			updated_by = excluded.updated_by`
		)
		.bind(venueId, JSON.stringify(clean), now, by)
		.run();
	return true;
}

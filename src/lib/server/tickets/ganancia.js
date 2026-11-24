/**
 * La ganancia de varios eventos a la vez, para las listas del panel (Inicio, Eventos,
 * Estadísticas, el bot): la cuenta de $lib/admin/ganancia.js con UNA consulta de tres sentencias,
 * sea cual sea la cantidad de eventos (nada de una consulta por evento). Interruptor
 * `gastos_reparto` y migración 0078: sin ellos, nada (las páginas se ven como antes).
 *
 * - lo que entró, sumado en SQL por evento, canal y medio de pago: `eventIncome` es lineal en
 *   cada columna, así que sumar las órdenes antes de pasárselas da lo mismo que pasarlas una por
 *   una (lo que importa para la ganancia; la cantidad de órdenes por fuente no se usa);
 * - lo guardado de cada cuenta (`event_accounts`);
 * - el cierre de cada cuenta (`event_account_closings`).
 */
import { cleanAccount, eventIncome } from '$lib/admin/reparto.js';
import { eventProfit } from '$lib/admin/ganancia.js';
import { rowsOf, runQuery } from '$lib/server/db/batch.js';
import { gastosRepartoEnabled } from '$lib/server/flags.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {import('$lib/admin/ganancia.js').EventProfit} EventProfit */

/** Las direcciones como una lista JSON (un solo parámetro), o todas (`null`). */
const IN_SLUGS = `event_slug IN (SELECT value FROM json_each(?1))`;

/**
 * La consulta (para ir en tanda, $lib/server/db/batch.js) de la ganancia de esos eventos (o de
 * todos, con `null`). Da un `Map` dirección → ganancia, solo de los eventos con alguna venta
 * aprobada o con la cuenta cerrada. Si falla (por ejemplo, sin la migración 0078), un `Map`
 * vacío: las páginas se ven sin la ganancia.
 *
 * @param {string[] | null} slugs
 * @returns {import('$lib/server/db/batch.js').BatchQuery<Map<string, EventProfit>>}
 */
export function profitsQuery(slugs) {
	const where = slugs === null ? '1 = 1' : IN_SLUGS;
	const bind = slugs === null ? [] : [JSON.stringify(slugs)];
	return {
		what: 'ganancia de los eventos',
		fallback: new Map(),
		statements: (db) =>
			slugs !== null && slugs.length === 0
				? []
				: [
						db
							.prepare(
								`SELECT event_slug, channel, payment_method, 'approved' AS status,
									SUM(quantity) AS quantity, SUM(total) AS total,
									SUM(COALESCE(surcharge_amount, 0)) AS surcharge_amount,
									SUM(COALESCE(fondo_amount, 0)) AS fondo_amount,
									SUM(COALESCE(fondo_contribution, 0)) AS fondo_contribution,
									SUM(COALESCE(extras_amount, 0)) AS extras_amount
								FROM orders WHERE status = 'approved' AND ${where}
								GROUP BY event_slug, channel, payment_method`
							)
							.bind(...bind),
						db.prepare(`SELECT event_slug, data FROM event_accounts WHERE ${where}`).bind(...bind),
						db
							.prepare(
								`SELECT event_slug, profit, income_total, expenses_total
								FROM event_account_closings WHERE ${where}`
							)
							.bind(...bind)
					],
		read: (results) => profitsFromRows(rowsOf(results, 0), rowsOf(results, 1), rowsOf(results, 2))
	};
}

/**
 * Arma la ganancia de cada evento con las filas de {@link profitsQuery}.
 * @param {Record<string, unknown>[]} orderRows
 * @param {Record<string, unknown>[]} accountRows
 * @param {Record<string, unknown>[]} closingRows
 * @returns {Map<string, EventProfit>}
 */
export function profitsFromRows(orderRows, accountRows, closingRows) {
	/** @type {Map<string, any[]>} */
	const orders = new Map();
	for (const r of orderRows) {
		const slug = String(r.event_slug);
		orders.set(slug, [...(orders.get(slug) ?? []), r]);
	}
	const accounts = new Map(
		accountRows.map((r) => [String(r.event_slug), cleanAccount(parse(String(r.data)))])
	);
	const closings = new Map(closingRows.map((r) => [String(r.event_slug), r]));
	/** @type {Map<string, EventProfit>} */
	const out = new Map();
	for (const slug of new Set([...orders.keys(), ...closings.keys()])) {
		const c = closings.get(slug);
		const p = eventProfit({
			income: orders.has(slug) ? eventIncome(orders.get(slug) ?? []) : null,
			account: accounts.get(slug) ?? null,
			closing: c
				? {
						profit: Number(c.profit),
						income_total: Number(c.income_total),
						expenses_total: Number(c.expenses_total)
					}
				: null
		});
		if (p) out.set(slug, p);
	}
	return out;
}

/** @param {string} s @returns {unknown} */
function parse(s) {
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
}

/**
 * ¿Se muestra la ganancia? Con el interruptor `gastos_reparto` prendido (si falla, no).
 * @param {App.Platform | undefined} platform
 */
export async function profitsEnabled(platform) {
	try {
		return await gastosRepartoEnabled(platform);
	} catch {
		return false;
	}
}

/**
 * La ganancia de esos eventos (o de todos, `null`), o `null` con el interruptor apagado o sin base.
 * @param {D1Database | null | undefined} db
 * @param {App.Platform | undefined} platform
 * @param {string[] | null} slugs
 * @returns {Promise<Map<string, EventProfit> | null>}
 */
export async function eventProfits(db, platform, slugs) {
	if (!db || !(await profitsEnabled(platform))) return null;
	return runQuery(db, profitsQuery(slugs));
}

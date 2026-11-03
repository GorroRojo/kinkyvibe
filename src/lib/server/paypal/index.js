/**
 * PayPal en las propinas, lo que no necesita credenciales (docs/propinas.md, «PayPal: cotización,
 * ajuste y retiros», decisión 0054): el ajuste en % de la cotización, los totales de las propinas
 * con PayPal (en dólares netos y en pesos estimados), el reparto por mes Fondo y los retiros.
 *
 * El cobro con PayPal todavía no existe: hasta entonces no hay filas con `provider = 'paypal'` y
 * todo lo de acá da ceros. Las cuentas en pesos están en $lib/utils/paypal.js; la cotización de
 * cada día, en ./rates.js.
 */
import {
	effectiveRate,
	estimateArs,
	parseAdjustmentPct,
	parseArsInt,
	parseUsdCents
} from '$lib/utils/paypal.js';
import { fondoMonthRange } from '$lib/server/fondo/propinasTotal.js';
import { readFondoTipTotals, fondoTipTotalsStatement } from '$lib/server/propinas/index.js';
import { arDay, isStale, isValidDay, rateForDay } from './rates.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** La clave de `ticket_settings` con el ajuste en % (texto, p. ej. `-4`). */
export const ADJUSTMENT_SETTING = 'paypal_rate_adjustment_pct';

/**
 * Las propinas con PayPal que cuentan para el Fondo: aprobadas y al Fondo. Las de Mercado Pago se
 * cuentan aparte (`FONDO_TIP_WHERE` en $lib/server/propinas/index.js, con `provider = 'mp'`).
 */
export const PAYPAL_FONDO_TIP_WHERE =
	"provider = 'paypal' AND status = 'approved' AND destination = 'fondo'";

/**
 * El ajuste guardado, con quién y cuándo lo cambió. Sin fila (o con algo que no se entiende): 0.
 *
 * @param {D1Database} db
 * @returns {Promise<{ pct: number, updatedAt: number | null, updatedBy: string | null }>}
 */
export async function getAdjustment(db) {
	const row = await db
		.prepare('SELECT value, updated_at, updated_by FROM ticket_settings WHERE key = ?1')
		.bind(ADJUSTMENT_SETTING)
		.first();
	if (!row) return { pct: 0, updatedAt: null, updatedBy: null };
	return {
		pct: parseAdjustmentPct(row.value) ?? 0,
		updatedAt: Number(row.updated_at),
		updatedBy: String(row.updated_by)
	};
}

/**
 * Guarda el ajuste (ya validado con `parseAdjustmentPct`).
 *
 * @param {D1Database} db
 * @param {number} pct
 * @param {{ by: string, now?: number }} opts
 */
export async function setAdjustment(db, pct, { by, now = Date.now() }) {
	await db
		.prepare(
			`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4)
			ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at,
				updated_by = excluded.updated_by`
		)
		.bind(ADJUSTMENT_SETTING, String(pct), now, by)
		.run();
}

/**
 * Las propinas con PayPal al Fondo aprobadas entre dos fechas de aprobación (ms, `from`
 * inclusive, `to` exclusive): lo neto en centavos y la base de cada una.
 *
 * @param {D1Database} db
 * @param {{ from: number, to: number }} range
 */
async function paypalRows(db, { from, to }) {
	const { results } = await db
		.prepare(
			`SELECT usd_net_cents, rate_base, approved_at FROM tips
			WHERE ${PAYPAL_FONDO_TIP_WHERE} AND approved_at >= ?1 AND approved_at < ?2`
		)
		.bind(from, to)
		.all();
	return results.map((r) => ({
		usdNetCents: Number(r.usd_net_cents ?? 0),
		rateBase: r.rate_base === null || r.rate_base === undefined ? null : Number(r.rate_base),
		approvedAt: Number(r.approved_at)
	}));
}

/**
 * Suma filas de PayPal: dólares netos (centavos), pesos estimados (cada pago redondeado para abajo
 * por separado, con su base y el ajuste de ahora) y cuántas. Una sin base suma dólares pero no
 * pesos (no debería pasar: el cobro guarda la base al aprobar).
 *
 * @param {{ usdNetCents: number, rateBase: number | null }[]} rows
 * @param {number} adjustmentPct
 */
export function sumPaypal(rows, adjustmentPct) {
	let usdCents = 0;
	let ars = 0;
	for (const r of rows) {
		usdCents += r.usdNetCents;
		if (r.rateBase !== null) ars += estimateArs(r.usdNetCents, r.rateBase, adjustmentPct);
	}
	return { usdCents, ars, count: rows.length };
}

/**
 * Los totales de PayPal de un rango, para `GET /api/fondo/propinas-total`: `{ usd, ars, count }`,
 * con `usd` en dólares (2 decimales).
 *
 * @param {D1Database} db
 * @param {{ from: number, to: number }} range
 * @param {number} adjustmentPct
 */
export async function paypalTipTotals(db, range, adjustmentPct) {
	const s = sumPaypal(await paypalRows(db, range), adjustmentPct);
	return { usd: s.usdCents / 100, ars: s.ars, count: s.count };
}

/**
 * El mes Fondo (`AAAA-MM`) en el que cae un momento: del 5 al 4 del mes siguiente, en hora de
 * Argentina.
 *
 * @param {number} ms
 */
export function fondoMonthOf(ms) {
	const day = arDay(ms);
	const y = Number(day.slice(0, 4));
	const m = Number(day.slice(5, 7));
	const d = Number(day.slice(8, 10));
	if (d >= 5) return day.slice(0, 7);
	return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/**
 * Los `count` meses Fondo hasta el de `now`, del más nuevo al más viejo.
 *
 * @param {number} now
 * @param {number} count
 */
export function lastFondoMonths(now, count) {
	const out = [fondoMonthOf(now)];
	while (out.length < count) {
		const [y, m] = out[out.length - 1].split('-').map(Number);
		out.push(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`);
	}
	return out;
}

/**
 * El reparto por mes Fondo para el panel: propinas de Mercado Pago (pesos), de PayPal (dólares
 * netos y pesos estimados) y el total en pesos, de los últimos `count` meses.
 *
 * @param {D1Database} db
 * @param {{ now?: number, count?: number, adjustmentPct: number }} opts
 */
export async function fondoMonthSplit(db, { now = Date.now(), count = 6, adjustmentPct }) {
	const months = lastFondoMonths(now, count).map((month) => ({
		month,
		range: /** @type {{ from: number, to: number }} */ (fondoMonthRange(month))
	}));
	const mpResults = await db.batch(months.map((m) => fondoTipTotalsStatement(db, m.range)));
	const oldest = months[months.length - 1].range.from;
	const newest = months[0].range.to;
	const rows = await paypalRows(db, { from: oldest, to: newest });
	return months.map((m, i) => {
		const mp = readFondoTipTotals(/** @type {any} */ (mpResults[i].results[0]));
		const pp = sumPaypal(
			rows.filter((r) => r.approvedAt >= m.range.from && r.approvedAt < m.range.to),
			adjustmentPct
		);
		return {
			month: m.month,
			mpArs: mp.total,
			mpCount: mp.count,
			paypalUsdCents: pp.usdCents,
			paypalArs: pp.ars,
			paypalCount: pp.count,
			totalArs: mp.total + pp.ars
		};
	});
}

/**
 * La cotización para un día (o la del último día guardado antes), con el ajuste: lo que devuelve
 * `GET /api/fondo/cotizacion` y lo que muestra el panel. Sin ninguna guardada: `null`.
 *
 * @param {D1Database} db
 * @param {{ day: string, adjustmentPct: number }} opts
 */
export async function quoteFor(db, { day, adjustmentPct }) {
	const rate = await rateForDay(db, day);
	if (!rate) return null;
	return {
		base: rate.compra,
		adjustmentPct,
		rate: effectiveRate(rate.compra, adjustmentPct),
		date: rate.day,
		stale: isStale(rate.day, day),
		updatedAt: new Date(rate.fetchedAt).toISOString(),
		source: rate.source
	};
}

/* ----------------------------------- Retiros ----------------------------------- */

/** Largo máximo de la nota de un retiro. */
export const WITHDRAWAL_NOTE_MAX = 200;

/**
 * @typedef {{
 *   id: number, day: string, usdCents: number, ars: number, note: string | null,
 *   createdAt: number, createdBy: string
 * }} Withdrawal
 */

/**
 * Los retiros, del más nuevo al más viejo, cada uno con la cotización real (pesos ÷ dólares) y la
 * estimada de ese día (base del día, o la última antes, con el ajuste de ahora).
 *
 * @param {D1Database} db
 * @param {{ adjustmentPct: number, limit?: number }} opts
 */
export async function listWithdrawals(db, { adjustmentPct, limit = 100 }) {
	const { results } = await db
		.prepare(
			`SELECT w.id, w.day, w.usd_cents, w.ars, w.note, w.created_at, w.created_by,
				(SELECT r.compra FROM mep_rates r WHERE r.day <= w.day ORDER BY r.day DESC LIMIT 1) AS base
			FROM paypal_withdrawals w ORDER BY w.day DESC, w.id DESC LIMIT ?1`
		)
		.bind(limit)
		.all();
	return results.map((r) => {
		const usdCents = Number(r.usd_cents);
		const ars = Number(r.ars);
		const base = r.base === null || r.base === undefined ? null : Number(r.base);
		const estimatedArs = base === null ? null : estimateArs(usdCents, base, adjustmentPct);
		return {
			id: Number(r.id),
			day: String(r.day),
			usdCents,
			ars,
			note: r.note === null ? null : String(r.note),
			createdAt: Number(r.created_at),
			createdBy: String(r.created_by),
			realRate: Math.round((ars * 100 * 100) / usdCents) / 100,
			estimatedRate: base === null ? null : effectiveRate(base, adjustmentPct),
			estimatedArs,
			// Cuánto se aleja lo real de lo estimado, en % (positivo: llegó más de lo estimado).
			diffPct: estimatedArs ? Math.round(((ars - estimatedArs) / estimatedArs) * 1000) / 10 : null
		};
	});
}

/**
 * Valida el formulario de un retiro. Fecha `AAAA-MM-DD` (no en el futuro), dólares y pesos
 * mayores que 0, nota opcional.
 *
 * @param {Record<string, unknown>} form
 * @param {{ now?: number }} [opts]
 */
export function validateWithdrawal(form, { now = Date.now() } = {}) {
	/** @type {Record<string, string>} */
	const errors = {};
	const day = String(form.day ?? '').trim();
	if (!isValidDay(day)) errors.day = 'Elegí la fecha del retiro.';
	else if (day > arDay(now)) errors.day = 'La fecha no puede ser en el futuro.';
	const usdCents = parseUsdCents(form.usd);
	if (usdCents === null) errors.usd = 'Poné los dólares que salieron (por ejemplo 120 o 120,50).';
	const ars = parseArsInt(form.ars);
	if (ars === null)
		errors.ars = 'Poné los pesos que llegaron, en pesos enteros (por ejemplo 150000).';
	const note = String(form.note ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (note.length > WITHDRAWAL_NOTE_MAX) errors.note = `Hasta ${WITHDRAWAL_NOTE_MAX} caracteres.`;
	if (Object.keys(errors).length) return /** @type {const} */ ({ ok: false, errors });
	return /** @type {const} */ ({
		ok: true,
		value: {
			day,
			usdCents: /** @type {number} */ (usdCents),
			ars: /** @type {number} */ (ars),
			note: note || null
		}
	});
}

/**
 * Guarda un retiro. Devuelve su id.
 *
 * @param {D1Database} db
 * @param {{ day: string, usdCents: number, ars: number, note: string | null }} w
 * @param {{ by: string, now?: number }} opts
 */
export async function addWithdrawal(db, { day, usdCents, ars, note }, { by, now = Date.now() }) {
	const res = await db
		.prepare(
			`INSERT INTO paypal_withdrawals (day, usd_cents, ars, note, created_at, created_by)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
		)
		.bind(day, usdCents, ars, note, now, by)
		.run();
	return Number(res.meta.last_row_id);
}

/**
 * Borra un retiro. Devuelve el que borró (para el registro) o `null` si no existía.
 *
 * @param {D1Database} db
 * @param {number} id
 */
export async function deleteWithdrawal(db, id) {
	const row = await db
		.prepare('SELECT id, day, usd_cents, ars FROM paypal_withdrawals WHERE id = ?1')
		.bind(id)
		.first();
	if (!row) return null;
	await db.prepare('DELETE FROM paypal_withdrawals WHERE id = ?1').bind(id).run();
	return {
		id: Number(row.id),
		day: String(row.day),
		usdCents: Number(row.usd_cents),
		ars: Number(row.ars)
	};
}

/* ------------------------------------- Panel ------------------------------------- */

/**
 * La parte de PayPal de Ajustes › Propinas: el ajuste, la cotización de hoy, el reparto por mes
 * Fondo y los retiros. Si la base falla (o falta la migración 0071): `error: true` y lo demás
 * vacío, sin romper la página.
 *
 * @param {D1Database} db
 * @param {number} [now]
 */
export async function loadPaypalPanel(db, now = Date.now()) {
	const today = arDay(now);
	try {
		const adjustment = await getAdjustment(db);
		const [quote, split, withdrawals] = await Promise.all([
			quoteFor(db, { day: today, adjustmentPct: adjustment.pct }),
			fondoMonthSplit(db, { now, adjustmentPct: adjustment.pct }),
			listWithdrawals(db, { adjustmentPct: adjustment.pct })
		]);
		return { error: false, today, adjustment, quote, split, withdrawals };
	} catch (e) {
		console.error('[paypal] no se pudo leer la parte de PayPal del panel', e);
		return {
			error: true,
			today,
			adjustment: { pct: 0, updatedAt: null, updatedBy: null },
			quote: null,
			split: [],
			withdrawals: []
		};
	}
}

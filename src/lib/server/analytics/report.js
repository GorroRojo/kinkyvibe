/**
 * Visitas para Panel → Estadísticas y resumen mensual en D1 (docs/analiticas.md).
 *
 * Analytics Engine guarda los datos unos 3 meses. Para no perder la historia, el cron nocturno
 * (scheduled.js) guarda en D1 (`analytics_monthly`, migración 0038) un resumen por mes: el total,
 * las páginas, orígenes, países y dispositivos más vistos y el embudo de cada evento. El panel
 * lee de Analytics Engine desde el primer día del mes anterior («en vivo») y de D1 los meses de
 * antes, sin superponerse.
 *
 * Los días y los meses son de **Argentina** (America/Argentina/Buenos_Aires: UTC−3 todo el año, sin
 * horario de verano). La API de SQL de Analytics Engine guarda `timestamp` en UTC: los días se
 * agrupan corriendo la hora 3 horas para atrás (`timestamp - INTERVAL '3' HOUR`, sin depender de que
 * la API acepte un huso horario), y los bordes de cada mes (en vivo y en el resumen de D1) son la
 * medianoche de Argentina, o sea las 03:00 UTC.
 *
 * Solo imports relativos: el cron lo usa sin pasar por Vite.
 */
import { DATASET, FUNNEL_STEPS } from './track.js';
import { AnalyticsQueryError, analyticsConfig, runSql, sqlDateTime } from './sql.js';

/** Dimensiones del resumen mensual, con la columna del dataset y cuántas se guardan. */
export const DIMENSIONS = Object.freeze({
	page: { column: 'blob2', limit: 50 },
	source: { column: 'blob3', limit: 50 },
	country: { column: 'blob4', limit: 50 },
	device: { column: 'blob5', limit: 10 }
});
/** Cuántas filas del embudo (evento × paso × medio) se guardan por mes, como mucho. */
const FUNNEL_LIMIT = 2000;
/** Días de los rankings del panel (páginas, orígenes, países, dispositivos). */
export const TOP_DAYS = 30;

/** Horas que Argentina está detrás de UTC (sin horario de verano). */
export const AR_OFFSET_HOURS = 3;
const AR_OFFSET_MS = AR_OFFSET_HOURS * 3_600_000;

/** La fecha `date` corrida a la hora de Argentina (para leerla con getUTC…/toISOString). */
const inArgentina = (/** @type {Date} */ date) => new Date(date.getTime() - AR_OFFSET_MS);

/** El día de Argentina (`YYYY-MM-DD`) de un instante. */
export function argentineDay(/** @type {Date} */ date) {
	return inArgentina(date).toISOString().slice(0, 10);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Primer instante del mes de Argentina de `date` más `offset` meses: la medianoche de Argentina
 * del día 1 (las 03:00 UTC).
 */
export function monthStart(/** @type {Date} */ date, offset = 0) {
	const ar = inArgentina(date);
	return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth() + offset, 1) + AR_OFFSET_MS);
}

/** `YYYY-MM` del mes de Argentina de un instante. */
export function monthKey(/** @type {Date} */ date) {
	return argentineDay(date).slice(0, 7);
}

/** `ago 2026` a partir de `2026-08`. */
export function monthLabel(/** @type {string} */ key) {
	const [y, m] = key.split('-').map(Number);
	return `${MONTHS[m - 1] ?? '?'} ${y}`;
}

/** @param {{ from: Date, to?: Date }} range */
function timeWhere({ from, to }) {
	const lo = `timestamp >= toDateTime('${sqlDateTime(from)}')`;
	return to ? `${lo} AND timestamp < toDateTime('${sqlDateTime(to)}')` : lo;
}

/** Visitas por día de Argentina desde `from` (`day` es la medianoche de ese día, sin huso). */
export function dailySql(/** @type {Date} */ from) {
	return `SELECT toStartOfInterval(timestamp - INTERVAL '${AR_OFFSET_HOURS}' HOUR, INTERVAL '1' DAY) AS day, SUM(_sample_interval) AS n
FROM ${DATASET}
WHERE blob1 = 'view' AND ${timeWhere({ from })}
GROUP BY day ORDER BY day`;
}

/**
 * Ranking de una columna de las visitas.
 *
 * @param {string} column `blob2`…`blob5`
 * @param {{ from?: Date, to?: Date, days?: number, limit: number }} o
 */
export function dimensionSql(column, o) {
	if (!/^blob[2-5]$/.test(column)) throw new Error(`columna inválida: ${column}`);
	const when = o.from
		? timeWhere({ from: o.from, to: o.to })
		: `timestamp >= NOW() - INTERVAL '${Math.trunc(o.days ?? TOP_DAYS)}' DAY`;
	return `SELECT ${column} AS k, SUM(_sample_interval) AS n
FROM ${DATASET}
WHERE blob1 = 'view' AND ${when}
GROUP BY k ORDER BY n DESC LIMIT ${Math.trunc(o.limit)}`;
}

/** Total de visitas entre dos fechas. */
export function totalSql(/** @type {{ from: Date, to?: Date }} */ range) {
	return `SELECT SUM(_sample_interval) AS n
FROM ${DATASET}
WHERE blob1 = 'view' AND ${timeWhere(range)}`;
}

/** Embudo por evento, paso y medio de pago. */
export function funnelSql(/** @type {{ from: Date, to?: Date }} */ range) {
	return `SELECT blob6 AS slug, blob7 AS step, blob8 AS method, SUM(_sample_interval) AS n
FROM ${DATASET}
WHERE blob6 != '' AND blob7 != '' AND ${timeWhere(range)}
GROUP BY slug, step, method ORDER BY n DESC LIMIT ${FUNNEL_LIMIT}`;
}

/** @param {unknown} v */
const num = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? Math.round(n) : 0;
};
/** @param {unknown} v */
const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * @typedef {{ month: string, dimension: string, key: string, value: number }} MonthlyRow
 */

/**
 * Las filas del resumen de un mes, consultando Analytics Engine.
 *
 * @param {{ accountId: string, token: string }} config
 * @param {Date} month cualquier fecha del mes
 * @param {{ fetch?: typeof fetch, now?: number }} [options]
 * @returns {Promise<MonthlyRow[]>}
 */
export async function monthRows(config, month, options = {}) {
	const from = monthStart(month);
	const to = monthStart(month, 1);
	const key = monthKey(from);
	const opts = { ...options, cache: false };
	const dims = Object.entries(DIMENSIONS);
	const [total, funnel, ...byDim] = await Promise.all([
		runSql(config, totalSql({ from, to }), opts),
		runSql(config, funnelSql({ from, to }), opts),
		...dims.map(([, d]) =>
			runSql(config, dimensionSql(d.column, { from, to, limit: d.limit }), opts)
		)
	]);
	/** @type {MonthlyRow[]} */
	const rows = [{ month: key, dimension: 'total', key: '', value: num(total[0]?.n) }];
	dims.forEach(([dimension], i) => {
		for (const r of byDim[i]) rows.push({ month: key, dimension, key: str(r.k), value: num(r.n) });
	});
	for (const r of funnel) {
		rows.push({
			month: key,
			dimension: 'funnel',
			key: `${str(r.slug)}|${str(r.step)}|${str(r.method)}`,
			value: num(r.n)
		});
	}
	return rows;
}

/**
 * Reemplaza el resumen de un mes en D1 (borra y vuelve a escribir, en una transacción).
 *
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} month `YYYY-MM`
 * @param {MonthlyRow[]} rows
 * @param {number} now
 */
export async function saveMonth(db, month, rows, now) {
	const insert = db.prepare(
		`INSERT INTO analytics_monthly (month, dimension, key, value, updated_at)
		VALUES (?1, ?2, ?3, ?4, ?5)`
	);
	await db.batch([
		db.prepare('DELETE FROM analytics_monthly WHERE month = ?1').bind(month),
		...rows.map((r) => insert.bind(month, r.dimension, r.key, r.value, now))
	]);
}

/**
 * Resumen mensual del cron nocturno: el mes anterior (así queda completo) y el mes en curso
 * (parcial, se vuelve a escribir cada noche). **Nunca tira**: sin token, sin base o si falla,
 * lo escribe en el log y sigue.
 *
 * @param {Record<string, unknown>} env
 * @param {{ now?: Date, fetch?: typeof fetch }} [options]
 * @returns {Promise<{ months: string[] } | null>}
 */
export async function runAnalyticsRollup(env, options = {}) {
	const now = options.now ?? new Date();
	try {
		const config = analyticsConfig(env);
		if (!config.ok) {
			console.log(
				`analiticas: sin resumen mensual (falta ${config.missing.map((m) => m.name).join(', ')})`
			);
			return null;
		}
		const db = /** @type {import('@cloudflare/workers-types').D1Database | undefined} */ (env.DB);
		if (!db) {
			console.error('analiticas: falta el binding DB; no se guardó el resumen mensual');
			return null;
		}
		const months = [monthStart(now, -1), monthStart(now)];
		/** @type {string[]} */
		const done = [];
		for (const m of months) {
			const rows = await monthRows(config, m, { fetch: options.fetch });
			await saveMonth(db, monthKey(m), rows, now.getTime());
			done.push(monthKey(m));
		}
		console.log(`analiticas: resumen mensual de ${done.join(', ')}`);
		return { months: done };
	} catch (error) {
		console.error('analiticas: el resumen mensual falló (el backup ya se hizo)', error);
		return null;
	}
}

/**
 * Resumen guardado de los meses anteriores a `beforeMonth` (`YYYY-MM`). Sin la tabla (falta la
 * migración) devuelve [].
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 * @param {string} beforeMonth
 * @returns {Promise<MonthlyRow[]>}
 */
export async function readMonthly(db, beforeMonth) {
	if (!db) return [];
	try {
		const { results } = await db
			.prepare(
				`SELECT month, dimension, key, value FROM analytics_monthly
				WHERE month < ?1 ORDER BY month`
			)
			.bind(beforeMonth)
			.all();
		return /** @type {MonthlyRow[]} */ (results);
	} catch (error) {
		console.warn('[analiticas] no se pudo leer analytics_monthly', error);
		return [];
	}
}

/**
 * @typedef {{ key: string, n: number }} Ranked
 * @typedef {{ slug: string, title: string, evento: number, abrio: number, datos: number,
 *   pagar: number, orden: number, aprobada: number, rate: number | null }} FunnelRow
 * @typedef {{
 *   configured: boolean,
 *   missing: { name: string, kind: 'Text' | 'Secret', why: string }[],
 *   error: string | null,
 *   liveFrom: string,
 *   topDays: number,
 *   totals: { views: number, phoneShare: number, countries: number },
 *   daily: { day: string, label: string, views: number }[],
 *   months: { month: string, label: string, views: number, saved: boolean }[],
 *   pages: Ranked[], sources: Ranked[], countries: Ranked[], devices: Ranked[],
 *   funnel: FunnelRow[]
 * }} VisitsReport
 */

/** @param {Record<string, unknown>[]} rows @returns {Ranked[]} */
const ranked = (rows) => rows.map((r) => ({ key: str(r.k), n: num(r.n) })).filter((r) => r.n > 0);

/**
 * Suma las filas del embudo (`slug|step|method` → n) por evento y paso.
 *
 * @param {{ slug: string, step: string, n: number }[]} rows
 * @param {(slug: string) => string} titleOf
 * @returns {FunnelRow[]}
 */
export function buildFunnel(rows, titleOf) {
	/** @type {Map<string, Record<string, number>>} */
	const bySlug = new Map();
	/** @type {Set<string>} */
	const steps = new Set(FUNNEL_STEPS.map((s) => s.id));
	for (const r of rows) {
		if (!r.slug || !steps.has(r.step)) continue;
		const e = bySlug.get(r.slug) ?? Object.fromEntries(FUNNEL_STEPS.map((s) => [s.id, 0]));
		e[r.step] += r.n;
		bySlug.set(r.slug, e);
	}
	return (
		[...bySlug.entries()]
			// Solo eventos que alguien vio de verdad (un aviso suelto con un slug inventado no aparece).
			.filter(([, e]) => e.evento + e.abrio > 0)
			.map(([slug, e]) => ({
				slug,
				title: titleOf(slug) || slug,
				evento: e.evento,
				abrio: e.abrio,
				datos: e.datos,
				pagar: e.pagar,
				orden: e.orden,
				aprobada: e.aprobada,
				rate: e.evento > 0 ? e.aprobada / e.evento : null
			}))
			.sort((a, b) => b.evento + b.abrio - (a.evento + a.abrio))
	);
}

/** Lista los días de Argentina entre `from` y `to` (incluidos). */
function daysBetween(/** @type {Date} */ from, /** @type {Date} */ to) {
	const out = [];
	const last = argentineDay(to);
	for (let t = inArgentina(from).getTime(); ; t += 86_400_000) {
		const day = new Date(t).toISOString().slice(0, 10);
		if (day > last) break;
		out.push(day);
	}
	return out;
}

/**
 * Mensaje para el panel cuando la consulta falla.
 * @param {unknown} error
 */
export function queryErrorMessage(error) {
	if (error instanceof AnalyticsQueryError && (error.status === 401 || error.status === 403)) {
		return 'Cloudflare rechazó el token: revisá que CF_ANALYTICS_TOKEN tenga el permiso «Account Analytics: Read» para esta cuenta y que CF_ACCOUNT_ID sea el de la cuenta.';
	}
	if (error instanceof AnalyticsQueryError && error.status === 422) {
		return 'Analytics Engine no entendió la consulta (¿todavía no hay ninguna visita guardada? El dataset aparece con la primera).';
	}
	return 'No pudimos leer las visitas de Cloudflare ahora. Probá de nuevo en unos minutos.';
}

/**
 * Todo lo de visitas para el panel. Nunca tira.
 *
 * @param {{
 *   env: Record<string, unknown>,
 *   db: import('@cloudflare/workers-types').D1Database | null | undefined,
 *   now?: Date,
 *   fetch?: typeof fetch,
 *   titleOf?: (slugs: string[]) => Promise<Map<string, string>>
 * }} input
 * @returns {Promise<VisitsReport>}
 */
export async function loadVisits({ env, db, now = new Date(), fetch: fetchFn, titleOf }) {
	const config = analyticsConfig(env);
	const liveFromDate = monthStart(now, -1);
	const liveFrom = monthKey(liveFromDate);
	// Todo lo guardado; si las consultas en vivo andan, se usan solo los meses de antes de liveFrom.
	const savedAll = await readMonthly(db, '9999-12');

	/** @type {VisitsReport} */
	const report = {
		configured: config.ok,
		missing: config.ok ? [] : config.missing,
		error: null,
		liveFrom: argentineDay(liveFromDate),
		topDays: TOP_DAYS,
		totals: { views: 0, phoneShare: 0, countries: 0 },
		daily: [],
		months: [],
		pages: [],
		sources: [],
		countries: [],
		devices: [],
		funnel: []
	};

	/** @type {Map<string, number>} */
	const liveMonths = new Map();
	/** @type {{ slug: string, step: string, n: number }[]} */
	const liveFunnel = [];
	let liveOk = false;

	if (config.ok) {
		try {
			const opts = { fetch: fetchFn, now: now.getTime() };
			const [daily, pages, sources, countries, devices, funnel] = await Promise.all([
				runSql(config, dailySql(liveFromDate), opts),
				runSql(config, dimensionSql('blob2', { limit: 20 }), opts),
				runSql(config, dimensionSql('blob3', { limit: 20 }), opts),
				runSql(config, dimensionSql('blob4', { limit: 30 }), opts),
				runSql(config, dimensionSql('blob5', { limit: 5 }), opts),
				runSql(config, funnelSql({ from: liveFromDate }), opts)
			]);
			/** @type {Map<string, number>} */
			const byDay = new Map();
			for (const r of daily) byDay.set(str(r.day).slice(0, 10), num(r.n));
			report.daily = daysBetween(liveFromDate, now).map((day) => ({
				day,
				label: `${Number(day.slice(8, 10))}/${Number(day.slice(5, 7))}`,
				views: byDay.get(day) ?? 0
			}));
			for (const d of report.daily) {
				const m = d.day.slice(0, 7);
				liveMonths.set(m, (liveMonths.get(m) ?? 0) + d.views);
			}
			report.pages = ranked(pages);
			report.sources = ranked(sources);
			report.countries = ranked(countries);
			report.devices = ranked(devices);
			for (const r of funnel) {
				liveFunnel.push({ slug: str(r.slug), step: str(r.step), n: num(r.n) });
			}
			const devTotal = report.devices.reduce((s, d) => s + d.n, 0);
			report.totals = {
				views: devTotal,
				phoneShare: devTotal
					? (report.devices.find((d) => d.key === 'phone')?.n ?? 0) / devTotal
					: 0,
				countries: report.countries.filter((c) => c.key).length
			};
			liveOk = true;
		} catch (error) {
			console.error('[analiticas] consulta', error);
			report.error = queryErrorMessage(error);
		}
	}

	const saved = liveOk ? savedAll.filter((r) => r.month < liveFrom) : savedAll;
	/** @type {Map<string, number>} */
	const monthViews = new Map();
	for (const r of saved) if (r.dimension === 'total') monthViews.set(r.month, num(r.value));
	const savedMonths = new Set(monthViews.keys());
	for (const [m, n] of liveMonths) monthViews.set(m, n);
	/** @type {{ slug: string, step: string, n: number }[]} */
	const funnelRows = [
		...saved
			.filter((r) => r.dimension === 'funnel')
			.map((r) => {
				const [slug = '', step = ''] = String(r.key).split('|');
				return { slug, step, n: num(r.value) };
			}),
		...liveFunnel
	];

	report.months = [...monthViews.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([month, views]) => ({
			month,
			label: monthLabel(month),
			views,
			saved: savedMonths.has(month) && !liveMonths.has(month)
		}));

	const slugs = [...new Set(funnelRows.map((r) => r.slug).filter(Boolean))];
	/** @type {Map<string, string>} */
	let titles = new Map();
	if (titleOf && slugs.length) {
		try {
			titles = await titleOf(slugs);
		} catch (error) {
			console.warn('[analiticas] títulos de eventos', error);
		}
	}
	report.funnel = buildFunnel(funnelRows, (s) => titles.get(s) ?? s).slice(0, 30);
	return report;
}

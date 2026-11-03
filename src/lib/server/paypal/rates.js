/**
 * La cotización del dólar MEP de cada día (tabla `mep_rates`, migración 0071), para estimar en
 * pesos las propinas con PayPal (docs/propinas.md, «PayPal: cotización, ajuste y retiros»,
 * decisión 0054). Una sola cotización para kinkyvibe.ar y fondo.kinkyvibe.ar: la sirve
 * `GET /api/fondo/cotizacion`.
 *
 * - **El día**: DolarApi («bolsa»), `{ compra, venta, fechaActualizacion }`, lo pide el cron diario
 *   después del cierre (`runMepRates`, desde src/lib/server/scheduled.js) y lo guarda como el día
 *   de Argentina de la corrida.
 * - **Los días que faltan** (un cron que no corrió, un fin de semana sin corrida): ArgentinaDatos,
 *   `{ compra, venta, fecha }` por día. Rellena los fines de semana y feriados con el último día
 *   hábil; el día de hoy puede venir atrasado, por eso hoy sale de DolarApi.
 * - Las dos son gratis, sin clave y sin garantía de que anden. Cada pedido tiene un tiempo máximo y
 *   cada número se valida (finito, mayor que 0, menor que un tope) antes de guardar. **Un día
 *   guardado no se pisa** (`ON CONFLICT DO NOTHING`): correr dos veces el mismo día no cambia nada,
 *   y un dato malo nunca reemplaza a uno bueno. Si un pedido falla, queda lo último guardado y el
 *   panel lo marca como viejo (`isStale`).
 *
 * Solo imports relativos: lo importa scheduled.js, que corre sin Vite.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{ day: string, compra: number, venta: number, source: string, fetchedAt: number }} MepRate
 */

export const DOLARAPI_URL = 'https://dolarapi.com/v1/dolares/bolsa';
export const ARGENTINADATOS_BASE = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa';

/** Tiempo máximo de cada pedido a las APIs (ms). */
export const FETCH_TIMEOUT_MS = 8000;
/** Cuántos días para atrás se revisan (y se piden, si faltan) en cada corrida. */
export const BACKFILL_DAYS = 10;
/** Una cotización por encima de esto es un dato roto. */
export const MAX_RATE = 10_000_000;
/** Un dato de DolarApi con más días que esto es viejo: no se guarda como el de hoy. */
export const MAX_LIVE_AGE_DAYS = 5;

/** Argentina: UTC−3 todo el año. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * El día de Argentina (`AAAA-MM-DD`) de un momento.
 *
 * @param {number} ms
 */
export function arDay(ms) {
	return new Date(ms - AR_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * ¿Es un día de verdad con la forma `AAAA-MM-DD`? (2026-02-30 no).
 *
 * @param {unknown} s
 * @returns {s is string}
 */
export function isValidDay(s) {
	if (typeof s !== 'string') return false;
	const m = DAY_RE.exec(s);
	if (!m) return false;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	return d.toISOString().slice(0, 10) === s;
}

/**
 * Suma (o resta) días a un `AAAA-MM-DD`.
 *
 * @param {string} day
 * @param {number} n
 */
export function addDays(day, n) {
	return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Días entre dos `AAAA-MM-DD` (`to` − `from`).
 *
 * @param {string} from
 * @param {string} to
 */
export function daysBetween(from, to) {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Una cotización que sirve: número finito, mayor que 0 y menor que {@link MAX_RATE}, con 2
 * decimales. Si no, `null`.
 *
 * @param {unknown} v
 * @returns {number | null}
 */
export function parseRate(v) {
	if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v >= MAX_RATE) return null;
	return Math.round(v * 100) / 100;
}

/**
 * La respuesta de DolarApi, validada: `{ compra, venta, updatedAt }` o `null`.
 *
 * @param {unknown} json
 * @returns {{ compra: number, venta: number, updatedAt: number } | null}
 */
export function parseLiveQuote(json) {
	if (!json || typeof json !== 'object') return null;
	const o = /** @type {Record<string, unknown>} */ (json);
	const compra = parseRate(o.compra);
	const venta = parseRate(o.venta);
	const updatedAt =
		typeof o.fechaActualizacion === 'string' ? Date.parse(o.fechaActualizacion) : NaN;
	if (compra === null || venta === null || !Number.isFinite(updatedAt)) return null;
	return { compra, venta, updatedAt };
}

/**
 * La respuesta de ArgentinaDatos para `day`, validada: `{ compra, venta }` o `null` (también si
 * `fecha` no es el día pedido).
 *
 * @param {unknown} json
 * @param {string} day
 * @returns {{ compra: number, venta: number } | null}
 */
export function parseHistoryQuote(json, day) {
	if (!json || typeof json !== 'object') return null;
	const o = /** @type {Record<string, unknown>} */ (json);
	const compra = parseRate(o.compra);
	const venta = parseRate(o.venta);
	if (compra === null || venta === null || o.fecha !== day) return null;
	return { compra, venta };
}

/** La dirección de ArgentinaDatos para un día: `…/bolsa/AAAA/MM/DD`. @param {string} day */
export function historyUrl(day) {
	return `${ARGENTINADATOS_BASE}/${day.replaceAll('-', '/')}`;
}

/**
 * GET de un JSON con tiempo máximo. Cualquier problema (red, tiempo, estado, JSON roto): `null`.
 *
 * @param {typeof fetch} fetchFn
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<unknown>}
 */
export async function fetchJson(fetchFn, url, timeoutMs = FETCH_TIMEOUT_MS) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetchFn(url, {
			headers: { accept: 'application/json', 'user-agent': 'kinkyvibe.ar' },
			signal: controller.signal
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Guarda la cotización de un día si ese día todavía no tiene una. Devuelve si la guardó.
 *
 * @param {D1Database} db
 * @param {MepRate} rate
 */
export async function storeRate(db, { day, compra, venta, source, fetchedAt }) {
	const res = await db
		.prepare(
			`INSERT INTO mep_rates (day, compra, venta, source, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5)
			ON CONFLICT (day) DO NOTHING`
		)
		.bind(day, compra, venta, source, fetchedAt)
		.run();
	return (res.meta?.changes ?? 0) > 0;
}

/**
 * @typedef {{
 *   today: string,
 *   todayResult: 'stored' | 'exists' | 'failed',
 *   backfilled: string[],
 *   missing: string[]
 * }} MepRunResult
 */

/**
 * La corrida diaria: hoy desde DolarApi (si hoy no está) y los días que faltan de los últimos
 * {@link BACKFILL_DAYS} desde ArgentinaDatos. Idempotente. No tira error si una API falla: lo
 * dice el resultado (`todayResult: 'failed'`, `missing`).
 *
 * @param {{ db: D1Database, fetch: typeof fetch, now?: number, backfillDays?: number }} input
 * @returns {Promise<MepRunResult>}
 */
export async function runMepRates({
	db,
	fetch: fetchFn,
	now = Date.now(),
	backfillDays = BACKFILL_DAYS
}) {
	const today = arDay(now);
	const from = addDays(today, -backfillDays);
	const { results } = await db
		.prepare('SELECT day FROM mep_rates WHERE day >= ?1 AND day <= ?2')
		.bind(from, today)
		.all();
	const have = new Set(results.map((r) => String(r.day)));

	/** @type {MepRunResult['todayResult']} */
	let todayResult = 'exists';
	if (!have.has(today)) {
		const live = parseLiveQuote(await fetchJson(fetchFn, DOLARAPI_URL));
		// Un dato de hace más de unos días no es el de hoy (la API se quedó trabada): no se guarda.
		const fresh = live && daysBetween(arDay(live.updatedAt), today) <= MAX_LIVE_AGE_DAYS;
		if (live && fresh) {
			const stored = await storeRate(db, {
				day: today,
				compra: live.compra,
				venta: live.venta,
				source: 'dolarapi',
				fetchedAt: now
			});
			todayResult = stored ? 'stored' : 'exists';
		} else {
			todayResult = 'failed';
		}
	}

	const backfilled = [];
	const missing = [];
	for (let day = addDays(today, -1); day >= from; day = addDays(day, -1)) {
		if (have.has(day)) continue;
		const quote = parseHistoryQuote(await fetchJson(fetchFn, historyUrl(day)), day);
		if (!quote) {
			missing.push(day);
			continue;
		}
		await storeRate(db, { day, ...quote, source: 'argentinadatos', fetchedAt: now });
		backfilled.push(day);
	}
	return { today, todayResult, backfilled, missing };
}

/** @param {Record<string, unknown>} r @returns {MepRate} */
function toRate(r) {
	return {
		day: String(r.day),
		compra: Number(r.compra),
		venta: Number(r.venta),
		source: String(r.source),
		fetchedAt: Number(r.fetched_at)
	};
}

/**
 * La cotización de `day` o, si ese día no tiene, la del último día guardado antes. Sin ninguna:
 * `null`.
 *
 * @param {D1Database} db
 * @param {string} day
 * @returns {Promise<MepRate | null>}
 */
export async function rateForDay(db, day) {
	const row = await db
		.prepare(
			'SELECT day, compra, venta, source, fetched_at FROM mep_rates WHERE day <= ?1 ORDER BY day DESC LIMIT 1'
		)
		.bind(day)
		.first();
	return row ? toRate(row) : null;
}

/**
 * ¿La cotización de `rateDay` es vieja para `day`? Sí si le lleva más de un día: el cron guarda la
 * de hoy después del cierre, así que hasta entonces lo normal es la de ayer.
 *
 * @param {string} rateDay
 * @param {string} day
 */
export function isStale(rateDay, day) {
	return daysBetween(rateDay, day) > 1;
}

/**
 * Plata del Fondo KinkyVibe del mes (suscripciones), para el Inicio del panel.
 *
 * Sale del mismo endpoint que el porcentaje (`fondo.js`): https://fondo.kinkyvibe.ar/api/porcentaje
 * devuelve `{ percent, collected, goal, step, updatedAt }`. Acá solo se usan esos números
 * agregados: nunca se piden, copian ni loguean datos de quienes aportan.
 *
 * Las suscripciones se reinician el día 5 de cada mes, así que "este mes" va del 5 (00:00 hora
 * de Argentina) al 4 del mes siguiente inclusive (`fondoMonthWindow`).
 *
 * Igual que el porcentaje: timeout de 3 s, memoria de 10 minutos en el isolate (1 minuto si
 * falló) y el último valor bueno guardado en D1 (`ticket_settings`, clave `fondo_status_last`)
 * para cuando la API no responde. Nunca tira error: sin datos devuelve `null`.
 */
import { env } from '$env/dynamic/private';
import { DEFAULT_FONDO_PERCENT_URL } from './fondo.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{ percent: number, collected: number, goal: number, step: number,
 *   updatedAt: number | null }} FondoStatus
 * @typedef {FondoStatus & { source: 'live' | 'stored', window: FondoWindow, stale: boolean }} FondoMonth
 * @typedef {{ start: number, end: number, startDate: string, endDate: string }} FondoWindow
 */

const LAST_KEY = 'fondo_status_last';
const MEMO_MS = 10 * 60 * 1000;
const FAILURE_MEMO_MS = 60 * 1000;
const TIMEOUT_MS = 3000;
/** Argentina: UTC-3 todo el año (sin horario de verano). */
const AR_OFFSET_MS = -3 * 60 * 60 * 1000;
/** Día del mes en que se reinician las suscripciones. */
export const FONDO_RESET_DAY = 5;

/** @type {{ status: FondoStatus, at: number } | null} */
let memo = null;
let failedAt = -Infinity;

/** Para los tests. */
export function resetFondoMonthMemo() {
	memo = null;
	failedAt = -Infinity;
}

/** @param {number} y @param {number} m0 @param {number} d */
const arMidnight = (y, m0, d) => Date.UTC(y, m0, d) - AR_OFFSET_MS;
/** @param {number} ms */
const isoDay = (ms) => new Date(ms + AR_OFFSET_MS).toISOString().slice(0, 10);

/**
 * Ventana del "mes" del Fondo que contiene `now`: desde el día 5 a las 00:00 (Argentina) hasta
 * el 5 del mes siguiente (exclusivo). `endDate` es el último día incluido (el 4).
 *
 * @param {number} [now]
 * @returns {FondoWindow}
 */
export function fondoMonthWindow(now = Date.now()) {
	const ar = new Date(now + AR_OFFSET_MS);
	let y = ar.getUTCFullYear();
	let m = ar.getUTCMonth();
	if (ar.getUTCDate() < FONDO_RESET_DAY) m -= 1;
	if (m < 0) {
		m = 11;
		y -= 1;
	}
	const start = arMidnight(y, m, FONDO_RESET_DAY);
	const end = arMidnight(m === 11 ? y + 1 : y, (m + 1) % 12, FONDO_RESET_DAY);
	return { start, end, startDate: isoDay(start), endDate: isoDay(end - 1) };
}

/** @param {unknown} v */
const num = (v) => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	return Number.isFinite(n) ? n : null;
};

/**
 * Se queda solo con los números agregados de la respuesta (cualquier otro campo se ignora).
 * `null` si falta lo esencial (`collected` y `goal`).
 *
 * @param {unknown} body
 * @returns {FondoStatus | null}
 */
export function parseFondoStatus(body) {
	if (!body || typeof body !== 'object') return null;
	const b = /** @type {Record<string, unknown>} */ (body);
	const collected = num(b.collected);
	const goal = num(b.goal);
	if (collected === null || goal === null || collected < 0 || goal < 0) return null;
	const percent = num(b.percent);
	const step = num(b.step);
	const updated =
		typeof b.updatedAt === 'string' || typeof b.updatedAt === 'number'
			? new Date(b.updatedAt).getTime()
			: NaN;
	return {
		percent: percent !== null && percent >= 0 && percent <= 100 ? percent : 0,
		collected: Math.round(collected),
		goal: Math.round(goal),
		step: step !== null && step > 0 ? step : 0,
		updatedAt: Number.isFinite(updated) ? updated : null
	};
}

/**
 * @param {typeof fetch} fetchFn
 * @param {string} url
 * @returns {Promise<FondoStatus | null>}
 */
async function fetchStatus(fetchFn, url) {
	try {
		const res = await fetchFn(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const status = parseFondoStatus(await res.json());
		if (!status) throw new Error('respuesta sin collected/goal');
		return status;
	} catch (error) {
		// Solo el motivo: nunca el cuerpo de la respuesta.
		console.warn('[fondo] no se pudo leer la plata del mes:', /** @type {Error} */ (error).message);
		return null;
	}
}

/**
 * @param {D1Database | null | undefined} db
 * @returns {Promise<FondoStatus | null>}
 */
async function getStored(db) {
	if (!db) return null;
	try {
		const row = await db
			.prepare('SELECT value FROM ticket_settings WHERE key = ?1')
			.bind(LAST_KEY)
			.first();
		return row ? parseFondoStatus(JSON.parse(String(row.value))) : null;
	} catch {
		return null;
	}
}

/**
 * @param {D1Database | null | undefined} db
 * @param {FondoStatus} status
 * @param {number} now
 */
async function store(db, status, now) {
	if (!db) return;
	try {
		await db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, 'fondo.kinkyvibe.ar')
				ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3`
			)
			.bind(LAST_KEY, JSON.stringify(status), now)
			.run();
	} catch {
		// no es grave: la próxima lectura lo intenta de nuevo
	}
}

/**
 * Plata de las suscripciones al Fondo en el mes en curso (del 5 al 4), o `null` si no hay datos.
 * `stale` es `true` cuando el dato es de antes del día 5 de esta ventana (fondo.kinkyvibe.ar
 * todavía no se actualizó este mes).
 *
 * @param {{ db?: D1Database | null, fetch?: typeof fetch, now?: number, url?: string }} [options]
 * @returns {Promise<FondoMonth | null>}
 */
export async function resolveFondoMonth({
	db,
	fetch: fetchFn = fetch,
	now = Date.now(),
	url
} = {}) {
	const window = fondoMonthWindow(now);
	/** @param {FondoStatus} s @param {'live' | 'stored'} source @returns {FondoMonth} */
	const wrap = (s, source) => ({
		...s,
		source,
		window,
		stale: s.updatedAt !== null && s.updatedAt < window.start
	});
	try {
		if (memo && now - memo.at < MEMO_MS) return wrap(memo.status, 'live');
		if (now - failedAt >= FAILURE_MEMO_MS) {
			const live = await fetchStatus(
				fetchFn,
				url ?? (env.FONDO_PERCENT_URL || DEFAULT_FONDO_PERCENT_URL)
			);
			if (live) {
				memo = { status: live, at: now };
				await store(db, live, now);
				return wrap(live, 'live');
			}
			failedAt = now;
		}
		const stored = await getStored(db);
		return stored ? wrap(stored, 'stored') : null;
	} catch {
		return null;
	}
}

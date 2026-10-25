/**
 * Descuento automático del Fondo Kinky Vibe: el porcentaje del mes sale de
 * https://fondo.kinkyvibe.ar/api/porcentaje (`{ percent, collected, goal, step, updatedAt }`,
 * `percent` de 0 a 100 en pasos de 10) y se aplica a todos los tipos de entrada con precio
 * (fondo = round(precio × percent / 100), al peso).
 *
 * Es el mismo para todos los eventos (solo los que tienen la etiqueta KinkyVibe usan el Fondo) y
 * sigue a fondo.kinkyvibe.ar también durante una venta: no hay porcentaje fijo por evento. Cada
 * orden guarda el porcentaje con el que se compró (`orders.fondo_percent`).
 *
 * De dónde sale el porcentaje, en orden:
 * 1. el que fija une admin en /admin/ajustes/fondo ("vacío = automático"; para emergencias,
 *    si fondo.kinkyvibe.ar no anda);
 * 2. (solo en `vite dev`) FONDO_PERCENT_OVERRIDE, para probar sin red;
 * 3. el de la API, con memoria de 10 minutos en el isolate y 3 s de timeout;
 * 4. el último que se obtuvo bien, guardado en D1 (`ticket_settings`) — si la API no responde;
 * 5. 0.
 * Nunca frena la venta: si todo falla, se vende sin descuento del fondo y se loguea un aviso.
 *
 * Las páginas que solo muestran el precio (la página del evento) piden `staleOk`: si la memoria
 * venció, usan el último porcentaje conocido (el de la memoria o el guardado en D1) sin esperar a
 * fondo.kinkyvibe.ar, y lo actualizan en segundo plano (`waitUntil`). La compra (`?/buy`) y la
 * página de compra esperan el valor de siempre: si cambió, «El descuento del Fondo cambió» avisa.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getSalesSettings } from './settings.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/**
 * @typedef {{ percent: number, source: 'admin' | 'override' | 'live' | 'stored' | 'none',
 *   updatedAt: number | null }} FondoPercent
 */

export const DEFAULT_FONDO_PERCENT_URL = 'https://fondo.kinkyvibe.ar/api/porcentaje';
const LAST_KEY = 'fondo_percent_last';
const MEMO_MS = 10 * 60 * 1000;
const FAILURE_MEMO_MS = 60 * 1000;
const TIMEOUT_MS = 3000;

/** @type {{ percent: number, at: number } | null} */
let memo = null;
/** @type {number} */
let failedAt = -Infinity;
/** Cuándo empezó la última actualización en segundo plano (`staleOk`): una a la vez por isolate. */
let refreshingAt = -Infinity;

/** Para los tests. */
export function resetFondoMemo() {
	memo = null;
	failedAt = -Infinity;
	refreshingAt = -Infinity;
}

/**
 * Porcentaje válido (entero de 0 a 100) o `null`.
 *
 * @param {unknown} raw
 */
export function parsePercent(raw) {
	if (raw === null || raw === undefined || raw === '') return null;
	const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace('%', ''));
	return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * Pide el porcentaje a la API. `null` si falla (red, timeout, 503, JSON raro).
 *
 * @param {typeof fetch} fetchFn
 * @param {string} url
 */
export async function fetchLivePercent(fetchFn, url) {
	try {
		const res = await fetchFn(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const body = /** @type {{ percent?: unknown }} */ (await res.json());
		const percent = parsePercent(body?.percent);
		if (percent === null) throw new Error(`percent inválido: ${JSON.stringify(body?.percent)}`);
		return percent;
	} catch (error) {
		console.warn(
			`[tickets] no se pudo leer el porcentaje del Fondo (${url}):`,
			/** @type {Error} */ (error).message
		);
		return null;
	}
}

/**
 * Último porcentaje que se obtuvo bien (guardado en D1).
 *
 * @param {D1Database | null | undefined} db
 * @returns {Promise<{ percent: number, at: number } | null>}
 */
export async function getStoredPercent(db) {
	if (!db) return null;
	try {
		const row = await db
			.prepare('SELECT value FROM ticket_settings WHERE key = ?1')
			.bind(LAST_KEY)
			.first();
		if (!row) return null;
		const v = JSON.parse(String(row.value));
		const percent = parsePercent(v?.percent);
		return percent === null ? null : { percent, at: Number(v.at) || 0 };
	} catch {
		return null;
	}
}

/**
 * @param {D1Database | null | undefined} db
 * @param {number} percent
 * @param {number} now
 */
async function storePercent(db, percent, now) {
	if (!db) return;
	try {
		await db
			.prepare(
				`INSERT INTO ticket_settings (key, value, updated_at, updated_by) VALUES (?1, ?2, ?3, 'fondo.kinkyvibe.ar')
				ON CONFLICT (key) DO UPDATE SET value = ?2, updated_at = ?3`
			)
			.bind(LAST_KEY, JSON.stringify({ percent, at: now }), now)
			.run();
	} catch (error) {
		console.warn('[tickets] no se pudo guardar el porcentaje del Fondo:', error);
	}
}

/**
 * Porcentaje del Fondo que se aplica ahora (a los eventos con la etiqueta KinkyVibe).
 *
 * Con `staleOk` y `waitUntil` (solo para mostrar, nunca para cobrar): si la memoria de 10 minutos
 * venció pero hay un porcentaje conocido (la memoria vencida o el último guardado en D1), lo
 * devuelve sin esperar a la API y la consulta en segundo plano con `waitUntil`. Sin porcentaje
 * conocido, espera a la API como siempre.
 *
 * @param {{ db?: D1Database | null, fetch?: typeof fetch, now?: number, url?: string,
 *   staleOk?: boolean, waitUntil?: (task: Promise<unknown>) => void }} [options]
 * @returns {Promise<FondoPercent>}
 */
export async function resolveFondoPercent({
	db,
	fetch: fetchFn = fetch,
	now = Date.now(),
	url,
	staleOk = false,
	waitUntil
} = {}) {
	try {
		const admin = parsePercent((await getSalesSettings(db)).fondo_percent_override);
		if (admin !== null) return { percent: admin, source: 'admin', updatedAt: null };
	} catch {
		// sin ajustes: seguimos con lo automático
	}
	if (dev) {
		const override = parsePercent(env.FONDO_PERCENT_OVERRIDE);
		if (override !== null) return { percent: override, source: 'override', updatedAt: null };
	}
	if (memo && now - memo.at < MEMO_MS) {
		return { percent: memo.percent, source: 'live', updatedAt: memo.at };
	}
	const apiUrl = url ?? (env.FONDO_PERCENT_URL || DEFAULT_FONDO_PERCENT_URL);
	if (staleOk && waitUntil) {
		const known = memo
			? { percent: memo.percent, source: /** @type {const} */ ('live'), at: memo.at }
			: await storedAsKnown(db);
		if (known) {
			// Una sola actualización en camino por isolate (dura como mucho el timeout de la API).
			if (now - failedAt >= FAILURE_MEMO_MS && now - refreshingAt >= TIMEOUT_MS + 1000) {
				refreshingAt = now;
				waitUntil(
					refreshLive(db, fetchFn, apiUrl, now).finally(() => {
						refreshingAt = -Infinity;
					})
				);
			}
			return { percent: known.percent, source: known.source, updatedAt: known.at };
		}
	}
	if (now - failedAt >= FAILURE_MEMO_MS) {
		const live = await refreshLive(db, fetchFn, apiUrl, now);
		if (live !== null) return { percent: live, source: 'live', updatedAt: now };
	}
	const stored = await getStoredPercent(db);
	if (stored) return { percent: stored.percent, source: 'stored', updatedAt: stored.at };
	return { percent: 0, source: 'none', updatedAt: null };
}

/**
 * El último porcentaje guardado en D1, como porcentaje conocido.
 * @param {D1Database | null | undefined} db
 */
async function storedAsKnown(db) {
	const stored = await getStoredPercent(db);
	return stored
		? { percent: stored.percent, source: /** @type {const} */ ('stored'), at: stored.at }
		: null;
}

/**
 * Pide el porcentaje a la API; si responde, lo recuerda en el isolate y lo guarda en D1 (si
 * cambió o cada tanto). Si no, anota la falla (un minuto sin volver a pedir) y da `null`.
 *
 * @param {D1Database | null | undefined} db
 * @param {typeof fetch} fetchFn
 * @param {string} apiUrl
 * @param {number} now
 * @returns {Promise<number | null>}
 */
async function refreshLive(db, fetchFn, apiUrl, now) {
	const live = await fetchLivePercent(fetchFn, apiUrl);
	if (live === null) {
		failedAt = now;
		return null;
	}
	const changed = memo?.percent !== live;
	memo = { percent: live, at: now };
	const stored = await getStoredPercent(db);
	// Se guarda si cambió o cada tanto (para que "última actualización" diga algo útil).
	if (changed || !stored || stored.percent !== live || now - stored.at >= MEMO_MS) {
		await storePercent(db, live, now);
	}
	return live;
}

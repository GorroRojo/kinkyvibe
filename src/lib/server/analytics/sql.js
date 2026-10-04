/**
 * Lectura de Analytics Engine con su API de SQL (HTTPS). Necesita el id de la cuenta
 * (`CF_ACCOUNT_ID`, variable de texto) y un token con permiso «Account Analytics: Read»
 * (`CF_ANALYTICS_TOKEN`, secreto). Los valores viven en el panel de Cloudflare, nunca en el repo.
 *
 * Las respuestas se guardan unos minutos en memoria (por isolate), así abrir Estadísticas varias
 * veces no repite las consultas.
 *
 * Solo imports relativos: el cron (scheduled.js) lo usa sin pasar por Vite.
 */

/** Cuánto se guarda una respuesta en memoria. */
export const CACHE_MS = 5 * 60_000;

/**
 * @typedef {{ ok: true, accountId: string, token: string }
 *   | { ok: false, missing: { name: string, kind: 'Text' | 'Secret', why: string }[] }} AnalyticsConfig
 */

/**
 * Qué hay configurado para leer las visitas, y qué falta (para el aviso del panel).
 *
 * @param {Record<string, unknown> | undefined | null} env
 * @returns {AnalyticsConfig}
 */
export function analyticsConfig(env) {
	const accountId = String(env?.CF_ACCOUNT_ID ?? '').trim();
	const token = String(env?.CF_ANALYTICS_TOKEN ?? '').trim();
	/** @type {{ name: string, kind: 'Text' | 'Secret', why: string }[]} */
	const missing = [];
	if (!accountId) {
		missing.push({
			name: 'CF_ACCOUNT_ID',
			kind: 'Text',
			why: 'el id de la cuenta de Cloudflare (32 caracteres; está en la página de inicio de la cuenta)'
		});
	} else if (!/^[0-9a-f]{32}$/i.test(accountId)) {
		missing.push({
			name: 'CF_ACCOUNT_ID',
			kind: 'Text',
			why: 'el valor cargado no parece un id de cuenta (tienen 32 letras y números)'
		});
	}
	if (!token) {
		missing.push({
			name: 'CF_ANALYTICS_TOKEN',
			kind: 'Secret',
			why: 'un token de API con el permiso «Account Analytics: Read»'
		});
	}
	return missing.length ? { ok: false, missing } : { ok: true, accountId, token };
}

/** Error de la API de SQL, con el código HTTP (401/403: token; 422: consulta). */
export class AnalyticsQueryError extends Error {
	/** @param {string} message @param {number} status */
	constructor(message, status) {
		super(message);
		this.name = 'AnalyticsQueryError';
		this.status = status;
	}
}

/** @type {Map<string, { at: number, rows: Record<string, unknown>[] }>} */
const cache = new Map();

/** Vacía la memoria (para los tests). */
export function clearSqlCache() {
	cache.clear();
}

/**
 * Corre una consulta y devuelve las filas (`data` del JSON). Con caché de {@link CACHE_MS}.
 *
 * @param {{ accountId: string, token: string }} config
 * @param {string} sql sin `FORMAT` (se agrega `FORMAT JSON`)
 * @param {{ fetch?: typeof fetch, now?: number, cache?: boolean }} [options]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function runSql(config, sql, options = {}) {
	const fetchFn = options.fetch ?? fetch;
	const now = options.now ?? Date.now();
	const key = `${config.accountId}\n${sql}`;
	const hit = options.cache === false ? undefined : cache.get(key);
	if (hit && now - hit.at < CACHE_MS) return hit.rows;
	const response = await fetchFn(
		`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/analytics_engine/sql`,
		{
			method: 'POST',
			headers: { authorization: `Bearer ${config.token}`, 'content-type': 'text/plain' },
			body: `${sql.trim()}\nFORMAT JSON`
		}
	);
	if (!response.ok) {
		const detail = (await response.text().catch(() => '')).slice(0, 200);
		throw new AnalyticsQueryError(
			`Analytics Engine respondió ${response.status}: ${detail}`,
			response.status
		);
	}
	const body = /** @type {{ data?: Record<string, unknown>[] }} */ (await response.json());
	const rows = Array.isArray(body?.data) ? body.data : [];
	if (options.cache !== false) cache.set(key, { at: now, rows });
	return rows;
}

/** Fecha UTC `YYYY-MM-DD HH:MM:SS` para `toDateTime('…')` (nunca viene de afuera). */
export function sqlDateTime(/** @type {Date} */ date) {
	return date.toISOString().slice(0, 19).replace('T', ' ');
}

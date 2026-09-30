/**
 * Rate limiting de ventana fija guardado en D1 (tabla `rate_limits`).
 *
 * Los `bucket` nunca deben contener datos identificables (ni IPs): usamos hashes anónimos o
 * el slug de un evento. Cada llamada borra las filas más viejas que la ventana más larga
 * permitida (`MAX_WINDOW_SECONDS`), así ninguna ventana en curso se pierde.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ limit: number, windowSeconds: number }} RateLimitRule */

/** La ventana más larga que acepta `hitRateLimit`; también es cuánto se guardan las filas. */
export const MAX_WINDOW_SECONDS = 24 * 60 * 60;

/**
 * Registra un intento en `bucket` y dice si está dentro del límite.
 *
 * @param {D1Database} db
 * @param {string} bucket
 * @param {RateLimitRule} rule
 * @param {number} [now] milisegundos (para tests)
 * @returns {Promise<{ allowed: boolean, hits: number, retryAfter: number }>}
 */
export async function hitRateLimit(db, bucket, { limit, windowSeconds }, now = Date.now()) {
	if (
		!Number.isInteger(windowSeconds) ||
		windowSeconds <= 0 ||
		windowSeconds > MAX_WINDOW_SECONDS
	) {
		throw new RangeError(`windowSeconds debe ser un entero entre 1 y ${MAX_WINDOW_SECONDS}`);
	}
	const nowSeconds = Math.floor(now / 1000);
	const windowStart = nowSeconds - (nowSeconds % windowSeconds);
	const [, upsert] = await db.batch([
		db
			.prepare('DELETE FROM rate_limits WHERE window_start < ?1')
			.bind(nowSeconds - MAX_WINDOW_SECONDS),
		db
			.prepare(
				`INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, 1)
				ON CONFLICT (bucket, window_start) DO UPDATE SET hits = hits + 1
				RETURNING hits`
			)
			.bind(bucket, windowStart)
	]);
	const hits = Number(/** @type {{ hits: number }[]} */ (upsert.results)[0]?.hits ?? 0);
	return {
		allowed: hits <= limit,
		hits,
		retryAfter: windowStart + windowSeconds - nowSeconds
	};
}

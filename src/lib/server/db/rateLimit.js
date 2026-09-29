/**
 * Rate limiting de ventana fija guardado en D1 (tabla `rate_limits`).
 *
 * Los `bucket` nunca deben contener datos identificables (ni IPs): usamos hashes anónimos o
 * el slug de un evento. Las ventanas de más de una hora se borran en cada llamada.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ limit: number, windowSeconds: number }} RateLimitRule */

const RETENTION_SECONDS = 60 * 60;

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
	const nowSeconds = Math.floor(now / 1000);
	const windowStart = nowSeconds - (nowSeconds % windowSeconds);
	const [, upsert] = await db.batch([
		db
			.prepare('DELETE FROM rate_limits WHERE window_start < ?1')
			.bind(nowSeconds - RETENTION_SECONDS),
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

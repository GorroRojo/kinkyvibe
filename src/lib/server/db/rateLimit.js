/**
 * Rate limiting guardado en D1 (tabla `rate_limits`).
 *
 * Las ventanas cortas (menos de {@link ROLLING_FROM_SECONDS}) son fijas: una fila por ventana.
 * Las largas (los topes «por día») son móviles: los intentos se anotan por hora y se suman las
 * últimas `windowSeconds` (con una ventana fija de 24 h, el cupo se podía gastar justo antes de
 * la medianoche UTC y otra vez justo después). En las móviles, un intento rechazado no se anota.
 *
 * Los `bucket` nunca deben contener datos identificables (ni IPs): usamos hashes anónimos o
 * el slug de un evento. Cada llamada borra las filas más viejas que la ventana más larga
 * permitida (`MAX_WINDOW_SECONDS`), así ninguna ventana en curso se pierde.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */
/** @typedef {{ limit: number, windowSeconds: number }} RateLimitRule */

/** La ventana más larga que acepta `hitRateLimit`; también es cuánto se guardan las filas. */
export const MAX_WINDOW_SECONDS = 24 * 60 * 60;

/** Desde qué ventana el conteo es móvil (por horas) en vez de fijo. */
export const ROLLING_FROM_SECONDS = 6 * 60 * 60;

/** El tramo en que se anotan los intentos de una ventana móvil. */
const ROLLING_STEP_SECONDS = 60 * 60;

/**
 * El tramo (fila) donde se anota un intento: la ventana fija, o la hora en una ventana móvil.
 * @param {number} windowSeconds
 * @param {number} nowSeconds
 */
function slotOf(windowSeconds, nowSeconds) {
	const step = isRolling(windowSeconds) ? ROLLING_STEP_SECONDS : windowSeconds;
	return nowSeconds - (nowSeconds % step);
}

/** @param {number} windowSeconds */
function isRolling(windowSeconds) {
	return windowSeconds >= ROLLING_FROM_SECONDS && windowSeconds % ROLLING_STEP_SECONDS === 0;
}

/**
 * Registra un intento en `bucket` y dice si está dentro del límite.
 *
 * @param {D1Database} db
 * @param {string} bucket
 * @param {RateLimitRule} rule
 * @param {number} [now] milisegundos (para tests)
 * @param {number} [cost] cuánto suma este intento (por ejemplo, megabytes subidos); 1 por defecto
 * @returns {Promise<{ allowed: boolean, hits: number, retryAfter: number }>}
 */
export async function hitRateLimit(
	db,
	bucket,
	{ limit, windowSeconds },
	now = Date.now(),
	cost = 1
) {
	if (
		!Number.isInteger(windowSeconds) ||
		windowSeconds <= 0 ||
		windowSeconds > MAX_WINDOW_SECONDS
	) {
		throw new RangeError(`windowSeconds debe ser un entero entre 1 y ${MAX_WINDOW_SECONDS}`);
	}
	if (!Number.isInteger(cost) || cost < 1) throw new RangeError('cost debe ser un entero positivo');
	const nowSeconds = Math.floor(now / 1000);
	const slot = slotOf(windowSeconds, nowSeconds);
	const rolling = isRolling(windowSeconds);
	const statements = [
		db
			.prepare('DELETE FROM rate_limits WHERE window_start < ?1')
			.bind(nowSeconds - MAX_WINDOW_SECONDS),
		db
			.prepare(
				`INSERT INTO rate_limits (bucket, window_start, hits) VALUES (?1, ?2, ?3)
				ON CONFLICT (bucket, window_start) DO UPDATE SET hits = hits + ?3
				RETURNING hits`
			)
			.bind(bucket, slot, cost)
	];
	if (!rolling) {
		const [, upsert] = await db.batch(statements);
		const hits = Number(/** @type {{ hits: number }[]} */ (upsert.results)[0]?.hits ?? 0);
		return { allowed: hits <= limit, hits, retryAfter: slot + windowSeconds - nowSeconds };
	}
	// Ventana móvil: las horas que todavía caen dentro de las últimas `windowSeconds`.
	const from = slot + ROLLING_STEP_SECONDS - windowSeconds;
	const [, , recent] = await db.batch([
		...statements,
		db
			.prepare(
				`SELECT window_start, hits FROM rate_limits
				WHERE bucket = ?1 AND window_start >= ?2 ORDER BY window_start`
			)
			.bind(bucket, from)
	]);
	const rows = /** @type {{ window_start: number, hits: number }[]} */ (recent.results);
	const hits = rows.reduce((sum, r) => sum + Number(r.hits), 0);
	if (hits <= limit) {
		return { allowed: true, hits, retryAfter: slot + ROLLING_STEP_SECONDS - nowSeconds };
	}
	// Un intento rechazado no queda anotado: si contara, quien sigue probando (o un cron que
	// reintenta cada tanto) nunca saldría del tope, porque cada rechazo se queda 24 h en la ventana.
	await db
		.prepare(
			'UPDATE rate_limits SET hits = MAX(hits - ?3, 0) WHERE bucket = ?1 AND window_start = ?2'
		)
		.bind(bucket, slot, cost)
		.run();
	// Cuándo se libera lugar: cuando salen de la ventana las horas más viejas que sobran.
	let left = hits - cost;
	let retryAfter = slot + ROLLING_STEP_SECONDS - nowSeconds;
	for (const r of rows) {
		if (left + cost <= limit) break;
		left -= Number(r.hits);
		retryAfter = Number(r.window_start) + windowSeconds - nowSeconds;
	}
	return { allowed: false, hits, retryAfter };
}

/**
 * Devuelve un intento registrado con {@link hitRateLimit} en la misma ventana (por ejemplo, un
 * envío que no llegó a hacerse porque el servicio dijo «ahora no»). Nunca baja de 0.
 *
 * @param {D1Database} db
 * @param {string} bucket
 * @param {Pick<RateLimitRule, 'windowSeconds'>} rule
 * @param {number} [now] milisegundos, el mismo que se le pasó a `hitRateLimit`
 */
export async function releaseRateLimitHit(db, bucket, { windowSeconds }, now = Date.now()) {
	const windowStart = slotOf(windowSeconds, Math.floor(now / 1000));
	await db
		.prepare(
			'UPDATE rate_limits SET hits = hits - 1 WHERE bucket = ?1 AND window_start = ?2 AND hits > 0'
		)
		.bind(bucket, windowStart)
		.run();
}

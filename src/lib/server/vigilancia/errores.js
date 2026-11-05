/**
 * Conteo de los errores 5xx del sitio (docs/workers-migracion.md, «Avisos de fallas por
 * Telegram»): cada respuesta 5xx suma uno en `error_counts` (migración 0074), por tramo de 10
 * minutos, ruta y estado. De acá sale el aviso de ./avisos.js cuando en la última hora hay muchos.
 *
 * - **Qué se guarda**: el patrón de la ruta de SvelteKit sin los grupos (`/entradas/[order]/estado`,
 *   nunca la dirección con datos ni la query), el estado, si es de una compra y el código corto del
 *   último error (el de errorLog.js, que se busca en los registros). Nada de compradores, mensajes
 *   ni IPs.
 * - **Umbrales** (fijos, en el código): {@link ERROR_ALERT_THRESHOLD} errores en la última hora en
 *   todo el sitio, o {@link PURCHASE_ALERT_THRESHOLD} en las rutas de compra
 *   ({@link PURCHASE_ROUTES}): una compra que falla importa más que cualquier otra página.
 * - Las filas duran {@link ERROR_RETENTION_MS} (las borra el cron de vigilancia).
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Largo de cada tramo del conteo. */
export const ERROR_BUCKET_MS = 10 * 60 * 1000;
/** La ventana del aviso: la última hora (los tramos que empezaron en la última hora). */
export const ERROR_WINDOW_MS = 60 * 60 * 1000;
/** Desde cuántos errores 5xx en la última hora (en todo el sitio) sale el aviso. */
export const ERROR_ALERT_THRESHOLD = 10;
/** Desde cuántos errores 5xx en la última hora en las rutas de compra sale el aviso. */
export const PURCHASE_ALERT_THRESHOLD = 2;
/** Cuánto duran las filas del conteo (para mirar con SQL si hace falta). */
export const ERROR_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** La ruta cuando el error pasó antes de elegir una (en los hooks). */
export const NO_ROUTE = '(sin ruta)';

/**
 * Las rutas de compra (sin los grupos): el webhook de Mercado Pago, el formulario de compra del
 * evento, la página de la orden y de las entradas, la compra en la puerta y las propinas. Cuenta
 * la ruta y todo lo que cuelga de ella.
 */
export const PURCHASE_ROUTES = Object.freeze([
	'/api/mercadopago',
	'/calendario/[event]/entradas',
	'/entradas',
	'/puerta/[slug]/compra',
	'/propinas'
]);

/**
 * El patrón de la ruta para guardar: el `route.id` de SvelteKit sin los grupos (`(content)`…).
 * `null` (no se eligió ruta) es {@link NO_ROUTE}.
 *
 * @param {string | null | undefined} routeId
 */
export function routeLabel(routeId) {
	if (!routeId) return NO_ROUTE;
	const label = routeId.replace(/\/\([^/)]+\)/g, '') || '/';
	return label.slice(0, 200);
}

/**
 * ¿Es una ruta de compra?
 *
 * @param {string} label lo que devuelve {@link routeLabel}
 */
export function isPurchaseRoute(label) {
	return PURCHASE_ROUTES.some((p) => label === p || label.startsWith(`${p}/`));
}

/**
 * Suma un error 5xx al conteo. Tira si la base falla (lo agarra quien llama).
 *
 * @param {D1Database} db
 * @param {{ now: number, route: string, status: number, errorId?: string | null }} input
 */
export async function recordServerError(db, { now, route, status, errorId = null }) {
	const bucket = Math.floor(now / ERROR_BUCKET_MS) * ERROR_BUCKET_MS;
	const id = typeof errorId === 'string' && /^[0-9a-z]{1,16}$/.test(errorId) ? errorId : null;
	await db
		.prepare(
			`INSERT INTO error_counts (bucket_start, route, status, purchase, hits, last_error_id, last_at)
			VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6)
			ON CONFLICT (bucket_start, route, status) DO UPDATE SET
				hits = hits + 1,
				last_error_id = coalesce(excluded.last_error_id, last_error_id),
				last_at = excluded.last_at`
		)
		.bind(bucket, route, status, isPurchaseRoute(route) ? 1 : 0, id, now)
		.run();
}

/**
 * Los errores de una ruta y estado en la última hora.
 *
 * @typedef {{ route: string, status: number, hits: number, purchase: boolean,
 *   lastErrorId: string | null }} ErrorRow
 */

/**
 * Los errores de la última hora: el total, los de compras y por ruta y estado (de la que más tiene
 * a la que menos).
 *
 * @param {D1Database} db
 * @param {number} now
 * @returns {Promise<{ total: number, purchase: number, rows: ErrorRow[] }>}
 */
export async function recentErrors(db, now) {
	const { results } = await db
		.prepare(
			`SELECT route, status, max(purchase) AS purchase, sum(hits) AS hits,
				(SELECT e2.last_error_id FROM error_counts e2
					WHERE e2.route = e.route AND e2.status = e.status AND e2.bucket_start > ?1
						AND e2.last_error_id IS NOT NULL
					ORDER BY e2.last_at DESC LIMIT 1) AS last_error_id
			FROM error_counts e
			WHERE bucket_start > ?1 AND bucket_start <= ?2
			GROUP BY route, status
			ORDER BY hits DESC, route, status`
		)
		.bind(now - ERROR_WINDOW_MS, now)
		.all();
	/** @type {ErrorRow[]} */
	const rows = results.map((r) => ({
		route: String(r.route),
		status: Number(r.status),
		hits: Number(r.hits),
		purchase: Number(r.purchase) === 1,
		lastErrorId: r.last_error_id == null ? null : String(r.last_error_id)
	}));
	return {
		total: rows.reduce((n, r) => n + r.hits, 0),
		purchase: rows.reduce((n, r) => n + (r.purchase ? r.hits : 0), 0),
		rows
	};
}

/**
 * ¿Llegaron a algún umbral? `'purchase'` si las compras llegaron al suyo (aunque el total no),
 * `'site'` si llegó el total, `null` si ninguno.
 *
 * @param {{ total: number, purchase: number }} recent
 * @returns {'purchase' | 'site' | null}
 */
export function alertKind({ total, purchase }) {
	if (purchase >= PURCHASE_ALERT_THRESHOLD) return 'purchase';
	if (total >= ERROR_ALERT_THRESHOLD) return 'site';
	return null;
}

/**
 * Borra las filas de más de {@link ERROR_RETENTION_MS}. Devuelve cuántas borró.
 *
 * @param {D1Database} db
 * @param {number} now
 */
export async function pruneErrorCounts(db, now) {
	const res = await db
		.prepare('DELETE FROM error_counts WHERE bucket_start < ?1')
		.bind(now - ERROR_RETENTION_MS)
		.run();
	return res.meta.changes ?? 0;
}

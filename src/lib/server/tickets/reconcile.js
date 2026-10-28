/**
 * Conciliación con Mercado Pago: si el webhook de un pago no llegó (MP caído, un 5xx nuestro que
 * agotó los reintentos) y la persona no volvió a la página de estado, la orden quedaría sin
 * aprobar aunque la plata haya entrado. El cron de cada 15 minutos
 * (src/routes/api/cron/recordatorios/+server.js) le pregunta a MP por esas órdenes. Ver
 * docs/tickets.md («Conciliación con Mercado Pago»).
 *
 * - Toma órdenes de Mercado Pago con preferencia creada, sin aprobar (pendientes, vencidas,
 *   rechazadas o canceladas sin pago) y creadas hace entre {@link MIN_AGE_MS} y {@link MAX_AGE_MS};
 *   las más nuevas primero.
 * - Cada orden se consulta como mucho una vez por ventana: de hora en hora en sus primeras
 *   {@link YOUNG_MS} y después cada {@link OLD_WINDOW_SECONDS} / 3600 horas (un checkout abandonado
 *   no gasta un pedido a MP por hora durante tres días). La marca es una fila de `rate_limits` con
 *   clave propia (`tickets:conc:<orden>`, el id de la orden no es un dato personal), así no hace
 *   falta una columna nueva. No comparte la clave de la página de estado.
 * - Las ya miradas en su ventana quedan afuera en la misma consulta y las demás van de la mirada
 *   hace más tiempo (o nunca) a la más reciente: con muchas órdenes abandonadas, ninguna queda sin
 *   mirar.
 * - Como mucho `limit` consultas a MP por corrida. Una consulta que falla devuelve su marca (se
 *   vuelve a probar en la próxima corrida) y, después de {@link MAX_CONSECUTIVE_FAILURES} fallas
 *   seguidas (MP caído), la corrida deja de consultar para no demorar el resto del cron.
 * - Solo una aprobación es un «pago aplicado sin webhook» (`approved`); otros cambios de estado
 *   (rechazado, cancelado, reembolsado, para revisar) se cuentan aparte (`updated`).
 * - El pago encontrado se aplica con `processPayment`, el mismo camino del webhook y de la página
 *   de estado: es idempotente (un pago ya aplicado no cambia nada) y marca `late_payment` o
 *   `duplicate_payment` cuando corresponde. Nunca toma el estado de otro lado que no sea la API.
 * - Sin token de MP (previews, dev sin simulado) no hace nada. Una consulta que falla se loguea y
 *   sigue con la próxima.
 */
import { hitRateLimit, releaseRateLimitHit } from '../db/rateLimit.js';
import { getGateway, processPayment } from './index.js';
import { HOLD_MS } from './orders.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Antes de esto la reserva sigue en curso: el webhook y la página de estado alcanzan. */
export const MIN_AGE_MS = HOLD_MS;
/** Pasado esto ya no se concilia sola (queda «Para revisar» y el panel de MP). */
export const MAX_AGE_MS = 72 * 60 * 60 * 1000;
/** Hasta esta edad la orden se mira una vez por hora; después, cada {@link OLD_WINDOW_SECONDS}. */
export const YOUNG_MS = 6 * 60 * 60 * 1000;
/** La ventana de una orden joven (segundos). */
export const YOUNG_WINDOW_SECONDS = 60 * 60;
/** La ventana de una orden de más de {@link YOUNG_MS} (segundos). */
export const OLD_WINDOW_SECONDS = 6 * 60 * 60;
/** Fallas seguidas al consultar a MP después de las que la corrida deja de consultar. */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** @param {string} id */
const bucketOf = (id) => `tickets:conc:${id}`;

/**
 * @param {{
 *   db: D1Database,
 *   origin: string,
 *   fetch: typeof fetch,
 *   platform?: App.Platform,
 *   now?: number,
 *   limit?: number,
 *   gateway?: import('./index.js').Gateway | null
 * }} input `gateway`, solo para tests (si falta, `getGateway`).
 * @returns {Promise<{ checked: number, approved: number, updated: number, failed: number,
 *   stopped?: true } | { skipped: 'sin-mp' }>} `stopped`: se cortó por fallas seguidas
 */
export async function reconcilePendingPayments({
	db,
	origin,
	fetch: fetchFn,
	platform,
	now = Date.now(),
	limit = 20,
	gateway
}) {
	const gw = gateway === undefined ? await getGateway(fetchFn) : gateway;
	if (!gw) return { skipped: 'sin-mp' };
	const youngSince = now - YOUNG_MS;
	const { results } = await db
		.prepare(
			`SELECT o.id, o.created_at FROM orders o
			WHERE o.payment_method = 'mercadopago'
				AND o.mp_preference_id IS NOT NULL
				AND (o.status IN ('pending', 'expired', 'rejected')
					OR (o.status = 'cancelled' AND o.mp_payment_id IS NULL))
				AND o.created_at >= ?1 AND o.created_at <= ?2
				AND NOT EXISTS (
					SELECT 1 FROM rate_limits r
					WHERE r.bucket = 'tickets:conc:' || o.id
						AND r.window_start > CASE WHEN o.created_at > ?3 THEN ?4 ELSE ?5 END
						AND r.hits > 0
				)
			ORDER BY (SELECT MAX(r.window_start) FROM rate_limits r
				WHERE r.bucket = 'tickets:conc:' || o.id AND r.hits > 0) ASC,
				o.created_at DESC
			LIMIT ?6`
		)
		.bind(
			now - MAX_AGE_MS,
			now - MIN_AGE_MS,
			youngSince,
			// «Ya mirada en esta ventana»: una marca que empieza después de esto. Sirve igual con la
			// ventana fija (una fila por ventana) que con una móvil (una por hora, rateLimit.js).
			Math.floor(now / 1000) - YOUNG_WINDOW_SECONDS,
			Math.floor(now / 1000) - OLD_WINDOW_SECONDS,
			limit
		)
		.all();
	/** @type {{ checked: number, approved: number, updated: number, failed: number, stopped?: true }} */
	const counts = { checked: 0, approved: 0, updated: 0, failed: 0 };
	let failedInARow = 0;
	for (const row of /** @type {{ id: string, created_at: number }[]} */ (results ?? [])) {
		const rule = {
			limit: 1,
			windowSeconds: row.created_at > youngSince ? YOUNG_WINDOW_SECONDS : OLD_WINDOW_SECONDS
		};
		// La marca es también el reclamo: si otra corrida ya la tomó en esta ventana, se saltea.
		const mark = await hitRateLimit(db, bucketOf(row.id), rule, now);
		if (!mark.allowed) continue;
		counts.checked++;
		try {
			const payment = await gw.findPaymentByOrder(row.id);
			failedInARow = 0;
			if (!payment || String(payment.external_reference) !== row.id) continue;
			const result = await processPayment({ db, payment, origin, fetch: fetchFn, platform });
			if (result.newlyApproved) {
				counts.approved++;
				console.warn(
					`[conciliacion] orden ${row.id}: pago ${payment.id} aplicado sin webhook (aprobada)`
				);
			} else if (result.outcome === 'updated' || result.outcome === 'flagged') {
				counts.updated++;
				console.log(
					`[conciliacion] orden ${row.id}: estado actualizado sin webhook (${result.order?.status ?? '?'}${result.outcome === 'flagged' ? ', para revisar' : ''})`
				);
			}
		} catch (error) {
			counts.failed++;
			failedInARow++;
			console.error(`[conciliacion] no se pudo consultar la orden ${row.id}:`, error);
			// Que la falla no gaste la ventana de la orden: se vuelve a probar en la próxima corrida.
			await releaseRateLimitHit(db, bucketOf(row.id), rule, now).catch(() => {});
			if (failedInARow >= MAX_CONSECUTIVE_FAILURES) {
				console.error(
					`[conciliacion] ${failedInARow} consultas seguidas fallaron: se corta hasta la próxima corrida`
				);
				counts.stopped = true;
				break;
			}
		}
	}
	return counts;
}

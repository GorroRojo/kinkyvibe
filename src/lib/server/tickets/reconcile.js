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
 * - Cada orden se consulta como mucho una vez por hora: la marca es una fila de `rate_limits` con
 *   clave propia (`tickets:conc:<orden>`, el id de la orden no es un dato personal), así no hace
 *   falta una columna nueva. No comparte la clave de la página de estado.
 * - Como mucho `limit` consultas a MP por corrida.
 * - El pago encontrado se aplica con `processPayment`, el mismo camino del webhook y de la página
 *   de estado: es idempotente (un pago ya aplicado no cambia nada) y marca `late_payment` o
 *   `duplicate_payment` cuando corresponde. Nunca toma el estado de otro lado que no sea la API.
 * - Sin token de MP (previews, dev sin simulado) no hace nada. Una consulta que falla se loguea y
 *   sigue con la próxima.
 */
import { hitRateLimit } from '../db/rateLimit.js';
import { getGateway, processPayment } from './index.js';
import { HOLD_MS } from './orders.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** Antes de esto la reserva sigue en curso: el webhook y la página de estado alcanzan. */
export const MIN_AGE_MS = HOLD_MS;
/** Pasado esto ya no se concilia sola (queda «Para revisar» y el panel de MP). */
export const MAX_AGE_MS = 72 * 60 * 60 * 1000;
/** Cuántas candidatas se leen por cada consulta permitida (deja lugar a las ya miradas). */
const SCAN_FACTOR = 3;
/** Una consulta por orden y por hora. */
const CHECK_RULE = Object.freeze({ limit: 1, windowSeconds: 60 * 60 });

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
 * @returns {Promise<{ checked: number, updated: number, failed: number } | { skipped: 'sin-mp' }>}
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
	const { results } = await db
		.prepare(
			`SELECT id FROM orders
			WHERE payment_method = 'mercadopago'
				AND mp_preference_id IS NOT NULL
				AND (status IN ('pending', 'expired', 'rejected')
					OR (status = 'cancelled' AND mp_payment_id IS NULL))
				AND created_at >= ?1 AND created_at <= ?2
			ORDER BY created_at DESC
			LIMIT ?3`
		)
		.bind(now - MAX_AGE_MS, now - MIN_AGE_MS, limit * SCAN_FACTOR)
		.all();
	const counts = { checked: 0, updated: 0, failed: 0 };
	for (const row of /** @type {{ id: string }[]} */ (results ?? [])) {
		if (counts.checked >= limit) break;
		const mark = await hitRateLimit(db, `tickets:conc:${row.id}`, CHECK_RULE, now);
		if (!mark.allowed) continue;
		counts.checked++;
		try {
			const payment = await gw.findPaymentByOrder(row.id);
			if (!payment || String(payment.external_reference) !== row.id) continue;
			const result = await processPayment({ db, payment, origin, fetch: fetchFn, platform });
			if (result.outcome === 'updated' || result.outcome === 'flagged') {
				counts.updated++;
				console.warn(
					`[conciliacion] orden ${row.id}: pago ${payment.id} aplicado sin webhook (${result.order?.status ?? '?'})`
				);
			}
		} catch (error) {
			counts.failed++;
			console.error(`[conciliacion] no se pudo consultar la orden ${row.id}:`, error);
		}
	}
	return counts;
}

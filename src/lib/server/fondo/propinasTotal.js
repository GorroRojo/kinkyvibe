/**
 * `GET /api/fondo/propinas-total?mes=AAAA-MM`: cuánto entró en propinas al Fondo en un «mes
 * Fondo», para el porcentaje de fondo.kinkyvibe.ar (issue #265, docs/propinas.md).
 *
 * En orden:
 * 1. `x-fondo-secret` = FONDO_MAIL_SECRET, el mismo chequeo en tiempo constante que
 *    `/api/fondo/mi-link` (`isValidFondoSecret`). Sin secreto configurado o con uno incorrecto: 401.
 * 2. `mes` con forma `AAAA-MM` (mes 01 a 12): si no, 400.
 * 3. La suma de las propinas al Fondo **aprobadas** cuya fecha de aprobación (`approved_at`) cae en
 *    ese mes Fondo (`fondoTipTotals`, la misma definición que el panel). Las reembolsadas no
 *    cuentan (su estado ya no es `approved`), así que el total de un mes cerrado puede bajar. Si la
 *    base falla: 503.
 *
 * Cuentan todas las propinas al Fondo: las del pie de las publicaciones y las «Una vez» que llegan
 * desde fondo.kinkyvibe.ar (`source = 'fondo'`). La respuesta no tiene nombres, mails, mensajes ni
 * ids de pago: solo `{ total, count, month, updatedAt }`. `Cache-Control: private, max-age=300`
 * (nunca en un caché compartido).
 */
import { logDBError } from '$lib/server/db';
import { fondoTipTotals } from '$lib/server/propinas/index.js';
import { isValidFondoSecret } from './miLink.js';
import { arMidnight } from '$lib/utils/dates.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/** `AAAA-MM`, con el mes entre 01 y 12. */
export const FONDO_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** El mes Fondo empieza el día 5. */
const FONDO_MONTH_START_DAY = 5;

/**
 * El rango de un mes Fondo, en ms: desde el 5 de ese mes a las 00:00 de Argentina (inclusive)
 * hasta el 5 del mes siguiente a las 00:00 de Argentina (exclusive), o sea hasta el 4 a las
 * 23:59:59.999. `2026-10` = 2026-10-05T03:00:00Z a 2026-11-05T03:00:00Z. Con otra forma: `null`.
 *
 * @param {string} mes
 * @returns {{ from: number, to: number } | null}
 */
export function fondoMonthRange(mes) {
	if (typeof mes !== 'string' || !FONDO_MONTH_RE.test(mes)) return null;
	const year = Number(mes.slice(0, 4));
	const month = Number(mes.slice(5, 7)); // 1 a 12
	// arMidnight (como Date.UTC) pasa diciembre + 1 a enero del año siguiente solo.
	const from = arMidnight(year, month - 1, FONDO_MONTH_START_DAY);
	const to = arMidnight(year, month, FONDO_MONTH_START_DAY);
	return { from, to };
}

/**
 * Respuesta sin detalle (cuerpo vacío) y sin caché.
 * @param {number} status
 */
function bare(status) {
	return new Response(null, { status, headers: { 'cache-control': 'no-store' } });
}

/**
 * Atiende el pedido entero (la ruta solo junta el entorno).
 *
 * @param {{
 *   request: Request,
 *   url: URL,
 *   secret: string | undefined,
 *   db: D1Database | null | undefined,
 *   now?: number
 * }} input
 * @returns {Promise<Response>}
 */
export async function handlePropinasTotal({ request, url, secret, db, now = Date.now() }) {
	if (!(await isValidFondoSecret(request.headers.get('x-fondo-secret'), secret))) {
		return bare(401);
	}
	const mes = url.searchParams.get('mes') ?? '';
	const range = fondoMonthRange(mes);
	if (!range) return bare(400);
	if (!db) return bare(503);
	let totals;
	try {
		totals = await fondoTipTotals(db, range);
	} catch (error) {
		logDBError('fondo propinas-total', error);
		return bare(503);
	}
	return Response.json(
		{
			total: totals.total,
			count: totals.count,
			month: mes,
			updatedAt: new Date(now).toISOString()
		},
		{ headers: { 'cache-control': 'private, max-age=300' } }
	);
}

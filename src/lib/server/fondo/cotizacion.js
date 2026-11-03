/**
 * `GET /api/fondo/cotizacion[?fecha=AAAA-MM-DD]`: la cotización con la que kinkyvibe.ar estima en
 * pesos los pagos en dólares (PayPal), para que fondo.kinkyvibe.ar convierta con el mismo número
 * (issue #265, docs/propinas.md, decisión 0054).
 *
 * En orden:
 * 1. `x-fondo-secret` = FONDO_MAIL_SECRET, el mismo chequeo en tiempo constante que
 *    `/api/fondo/propinas-total` (`isValidFondoSecret`). Sin secreto configurado o con uno
 *    incorrecto: 401 sin cuerpo.
 * 2. Con el interruptor `paypal` apagado: 404 sin cuerpo.
 * 3. `fecha` opcional, un día de verdad `AAAA-MM-DD` (sin ella, hoy en Argentina): si no, 400.
 * 4. La cotización de ese día o, si no tiene, la del último día guardado antes. Sin ninguna
 *    guardada, o si la base falla: 503.
 *
 * Respuesta: `{ base, adjustmentPct, rate, date, stale, updatedAt }`. `base` es el dólar MEP
 * «compra» de `date` (el día del dato, que puede ser anterior a `fecha`); `rate` = base × (1 +
 * adjustmentPct / 100), con 2 decimales; `stale` dice si el dato le lleva más de un día a `fecha`
 * (el cron no pudo traer los últimos); `updatedAt`, cuándo se guardó. `Cache-Control: private,
 * max-age=300`.
 */
import { logDBError } from '$lib/server/db';
import { getAdjustment, quoteFor } from '$lib/server/paypal/index.js';
import { arDay, isValidDay } from '$lib/server/paypal/rates.js';
import { isValidFondoSecret } from './miLink.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

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
 *   enabled: boolean | (() => Promise<boolean>),
 *   now?: number
 * }} input `enabled`: el interruptor `paypal` (se lee recién después del secreto).
 * @returns {Promise<Response>}
 */
export async function handleCotizacion({ request, url, secret, db, enabled, now = Date.now() }) {
	if (!(await isValidFondoSecret(request.headers.get('x-fondo-secret'), secret))) {
		return bare(401);
	}
	if (!(typeof enabled === 'function' ? await enabled() : enabled)) return bare(404);
	const fecha = url.searchParams.get('fecha');
	if (fecha !== null && !isValidDay(fecha)) return bare(400);
	if (!db) return bare(503);
	let quote;
	try {
		const { pct } = await getAdjustment(db);
		quote = await quoteFor(db, { day: fecha ?? arDay(now), adjustmentPct: pct });
	} catch (error) {
		logDBError('fondo cotizacion', error);
		return bare(503);
	}
	if (!quote) return bare(503);
	const { base, adjustmentPct, rate, date, stale, updatedAt } = quote;
	return Response.json(
		{ base, adjustmentPct, rate, date, stale, updatedAt },
		{ headers: { 'cache-control': 'private, max-age=300' } }
	);
}

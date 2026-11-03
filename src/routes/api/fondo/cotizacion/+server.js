/**
 * GET /api/fondo/cotizacion[?fecha=AAAA-MM-DD]: la cotización del dólar (MEP «compra» con el ajuste
 * de gorrite) para fondo.kinkyvibe.ar, con el header `x-fondo-secret` (docs/propinas.md, «PayPal:
 * cotización, ajuste y retiros»). La lógica está en $lib/server/fondo/cotizacion.js; esta ruta solo
 * junta el secreto, la base y el interruptor `paypal`.
 *
 * Pedido de servidor a servidor: sin headers CORS, así que un navegador de otro sitio no puede
 * leer la respuesta.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { handleCotizacion } from '$lib/server/fondo/cotizacion.js';
import { paypalEnabled } from '$lib/server/flags.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request, url, platform }) {
	return handleCotizacion({
		request,
		url,
		secret: env.FONDO_MAIL_SECRET,
		db: getDB(platform),
		enabled: () => paypalEnabled(platform)
	});
}

/**
 * GET /api/fondo/propinas-total?mes=AAAA-MM: el total de propinas al Fondo de un «mes Fondo», para
 * fondo.kinkyvibe.ar, con el header `x-fondo-secret` (docs/propinas.md, «Total para el Fondo»). La
 * lógica está en $lib/server/fondo/propinasTotal.js; esta ruta solo junta el secreto y la base.
 *
 * Pedido de servidor a servidor: sin headers CORS, así que un navegador de otro sitio no puede
 * leer la respuesta.
 */
import { env } from '$env/dynamic/private';
import { getDB } from '$lib/server/db';
import { handlePropinasTotal } from '$lib/server/fondo/propinasTotal.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ request, url, platform }) {
	return handlePropinasTotal({
		request,
		url,
		secret: env.FONDO_MAIL_SECRET,
		db: getDB(platform)
	});
}

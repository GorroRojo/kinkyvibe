/**
 * POST /entradas/t/<token>/visto: la página de la entrada avisa que está abierta y a la vista
 * («Con la entrada abierta ahora» en la Puerta; $lib/server/tickets/presence.js). Se autentica con
 * el token, como la página. Sin cuerpo ni datos en la respuesta:
 * - 204: anotado (o ya estaba anotado hace menos de un minuto);
 * - 410: esta entrada no se anota (anulada, ya entró, fuera del día del evento, o la abrió une
 *   admin: escanear el QR con la cámara no es «estar por llegar»); la página deja de avisar;
 * - 404: no existe; 503: sin base o sin la columna todavía (la página sigue probando).
 */
import { isAdmin } from '$lib/server/auth';
import { getDB, logDBError } from '$lib/server/db';
import { isValidToken } from '$lib/server/tickets/orders.js';
import { touchTicketPresence } from '$lib/server/tickets/presence.js';

const HEADERS = {
	'cache-control': 'no-store',
	'referrer-policy': 'no-referrer',
	'x-robots-tag': 'noindex, nofollow'
};

/** @param {number} status */
const reply = (status) => new Response(null, { status, headers: HEADERS });

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, platform, locals }) {
	if (!isValidToken(params.token)) return reply(404);
	if (isAdmin(locals.user)) return reply(410);
	const db = getDB(platform);
	if (!db) return reply(503);
	try {
		const r = await touchTicketPresence(db, { token: params.token });
		return reply(r === 'ok' || r === 'recent' ? 204 : r === 'not-found' ? 404 : 410);
	} catch (error) {
		logDBError('entrada abierta', error);
		return reply(503);
	}
}

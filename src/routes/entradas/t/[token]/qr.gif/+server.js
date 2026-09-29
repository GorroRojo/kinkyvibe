/**
 * QR de una entrada como GIF, para el email (Gmail y otros clientes no muestran SVG).
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { siteOrigin } from '$lib/server/tickets/index.js';
import { getTicketByToken, isValidToken } from '$lib/server/tickets/orders.js';
import { qrGif } from '$lib/server/tickets/qr.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, url }) {
	if (!isValidToken(params.token)) error(404, 'Entrada no encontrada.');
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	// Solo generamos QRs de entradas que existen (no es un generador de QRs público).
	if (!(await getTicketByToken(db, params.token))) error(404, 'Entrada no encontrada.');
	const gif = qrGif(`${siteOrigin(url)}/entradas/t/${params.token}`);
	return new Response(gif, {
		headers: {
			'content-type': 'image/gif',
			'cache-control': 'private, max-age=86400',
			'referrer-policy': 'no-referrer',
			'x-robots-tag': 'noindex'
		}
	});
}

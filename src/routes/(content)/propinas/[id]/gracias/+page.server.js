/**
 * /propinas/<id>/gracias: adonde vuelve Mercado Pago después de pagar (las back_urls de la
 * preferencia). El estado sale de la base (lo cambia el webhook); si sigue pendiente, se le
 * pregunta a MP una vez (`recheckTip`). Los parámetros que agrega MP a la URL se ignoran.
 *
 * Anda aunque el interruptor esté apagado: si alguien pagó, que vea el gracias.
 */
import { error } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { getTip, recheckTip } from '$lib/server/propinas/index.js';
import { tipPostPath } from '$lib/utils/propinas.js';
import { getGateway } from '$lib/server/tickets/index.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, platform, fetch, setHeaders }) {
	// El id de la propina va en la URL: que no se indexe, no se filtre por Referer ni se cachee.
	setHeaders({
		'referrer-policy': 'no-referrer',
		'x-robots-tag': 'noindex, nofollow',
		'cache-control': 'private, no-store'
	});
	const db = getDB(platform);
	let tip = db ? await getTip(db, params.id) : null;
	if (!db || !tip) error(404, 'No encontramos esa propina.');
	tip = await recheckTip({ db, gateway: await getGateway(fetch), tip });
	return {
		tip: { amount: tip.amount, status: tip.status, destination: tip.destination },
		// Siempre una ruta de este sitio armada acá (nunca una URL que venga de afuera).
		postPath: tipPostPath(tip.post_category, tip.post_slug)
	};
}

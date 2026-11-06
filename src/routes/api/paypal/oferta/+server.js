/**
 * ¿Se puede pagar con PayPal ahora, y con qué cotización? Para el formulario de propina (que está
 * también en páginas que no pasan por el servidor): con JavaScript, muestra «PayPal» y los
 * dólares del monto elegido (la misma cuenta que hace el servidor, `usdCentsForArs`). Sin el
 * interruptor, sin credenciales o sin una cotización reciente: `{ available: false }`.
 */
import { json } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { paypalOffer } from '$lib/server/paypal/payments.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ platform, setHeaders }) {
	setHeaders({ 'cache-control': 'no-store' });
	const offer = await paypalOffer(getDB(platform));
	if (!offer) return json({ available: false });
	return json({
		available: true,
		base: offer.base,
		adjustmentPct: offer.adjustmentPct,
		rate: offer.rate
	});
}

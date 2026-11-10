/**
 * La vuelta de PayPal (`return_url` y `cancel_url` de las órdenes de PayPal; docs/paypal.md).
 * PayPal agrega `?token=<orden de PayPal>`. El token solo dice QUÉ orden mirar: el estado sale de
 * la API. Si quien paga la aprobó, se cobra (captura) acá mismo y se aplica; el webhook es el
 * respaldo. Si canceló (`?cancelado=1`) sin aprobar, la compra se cancela y libera el lugar. Después, a la página de estado de la compra o a la de gracias de la propina (que
 * vuelven a mirar si hace falta).
 */
import { isRedirect, redirect } from '@sveltejs/kit';
import { getDB } from '$lib/server/db';
import { hitRateLimit } from '$lib/server/db/rateLimit.js';
import { isPaypalId } from '$lib/server/paypal/client.js';
import { getPaypalGateway } from '$lib/server/paypal/gateway.js';
import { paymentFromPaypalOrder, parseCustomId } from '$lib/server/paypal/payments.js';
import { processPaypalPayment, returnPath } from '$lib/server/paypal/process.js';
import { siteOrigin } from '$lib/server/tickets/index.js';
import { cancelPaypalOrder, getOrder } from '$lib/server/tickets/orders.js';
import { queueWaitlistAdvance } from '$lib/server/tickets/waitlistEngine.js';
import { cancelPaypalTip } from '$lib/server/propinas/paypal.js';

const RETURN_LIMIT = { limit: 20, windowSeconds: 60 };

/** Estados de una orden de PayPal en los que todavía no se aprobó nada. */
const UNPAID = new Set(['CREATED', 'SAVED', 'PAYER_ACTION_REQUIRED', 'VOIDED']);

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, platform, fetch }) {
	const token = url.searchParams.get('token');
	const db = getDB(platform);
	const gateway = await getPaypalGateway(fetch);
	if (!isPaypalId(token) || !db || !gateway) redirect(303, '/');
	const id = /** @type {string} */ (token);
	/** @type {{ kind: 'propina' | 'entrada' | null, id: string | null }} */
	let target = { kind: null, id: null };
	try {
		const limit = await hitRateLimit(db, `paypal:v:${id}`, RETURN_LIMIT);
		if (!limit.allowed) redirect(303, '/');
		let order = await gateway.getOrder(id);
		target = parseCustomId(paymentFromPaypalOrder(order).external_reference) ?? target;
		if (url.searchParams.get('cancelado') === '1') {
			// Canceló en PayPal: si de verdad no aprobó nada, no se cobra y se libera el lugar (la
			// propina queda «no se completó»). Si ya estaba aprobada, sigue como una vuelta normal.
			if (target.kind && UNPAID.has(String(order?.status))) {
				if (target.kind === 'propina') await cancelPaypalTip(db, String(target.id), id);
				else if (await cancelPaypalOrder(db, String(target.id), id)) {
					const fresh = await getOrder(db, String(target.id));
					if (fresh) {
						queueWaitlistAdvance({
							platform,
							db,
							eventSlug: fresh.event_slug,
							fetch,
							origin: siteOrigin(url)
						});
					}
				}
				redirect(303, returnPath(target));
			}
		}
		if (target.kind) {
			if (order?.status === 'APPROVED') order = await gateway.captureOrder(id);
			const res = await processPaypalPayment({
				db,
				payment: paymentFromPaypalOrder(order),
				origin: siteOrigin(url),
				fetch,
				platform
			});
			target = { kind: res.kind, id: res.id };
		}
	} catch (error) {
		if (isRedirect(error)) throw error;
		// La página de estado vuelve a mirar; el webhook también.
		console.error(`[paypal] no se pudo terminar el pago de la orden ${id} a la vuelta:`, error);
	}
	redirect(303, returnPath(target));
}

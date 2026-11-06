/**
 * Webhook de PayPal (docs/paypal.md). La app de PayPal es la misma que usa fondo.kinkyvibe.ar
 * (decisión 0054): este webhook se suscribe solo a los eventos de órdenes y capturas
 * (`WEBHOOK_EVENTS`) e ignora con un 2xx lo que no es de kinkyvibe (`custom_id` sin `kv-`).
 *
 * 1. Verifica la firma con la API de PayPal (`verify-webhook-signature`, con PAYPAL_WEBHOOK_ID).
 *    Sin firma válida: 401.
 * 2. NUNCA confía en el cuerpo: solo saca de qué orden de PayPal se trata, la pide a la API (y la
 *    cobra si está aprobada) y la aplica a la propina o a la orden de entradas, de forma
 *    idempotente (lo mismo que la vuelta del pago y el re-chequeo).
 * 3. Errores transitorios (base, API de PayPal) devuelven 5xx para que PayPal reintente.
 */
import { json, text } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getDB, logDBError } from '$lib/server/db';
import { readJsonCapped } from '$lib/server/http/body.js';
import { getPaypalGateway } from '$lib/server/paypal/gateway.js';
import { webhookTarget } from '$lib/server/paypal/payments.js';
import { settleAndProcess } from '$lib/server/paypal/process.js';
import { siteOrigin } from '$lib/server/tickets/index.js';
import { reportPurchaseFailure } from '$lib/server/telegram/purchaseAlerts.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url, platform, fetch }) {
	const read = await readJsonCapped(request, 64 * 1024);
	if (!read.ok)
		return text(read.reason === 'too-large' ? 'too large' : 'bad request', {
			status: read.reason === 'too-large' ? 413 : 400
		});
	/** @type {any} */
	const event = read.value;

	const gateway = await getPaypalGateway(fetch);
	const db = getDB(platform);
	if (!gateway || !db || (!gateway.mock && !env.PAYPAL_WEBHOOK_ID)) {
		console.error('[paypal] webhook sin configurar (faltan credenciales o PAYPAL_WEBHOOK_ID)');
		return text('not configured', { status: 503 });
	}
	let verified = false;
	try {
		verified = await gateway.verifyWebhook({ headers: request.headers, event });
	} catch (error) {
		console.error('[paypal] no se pudo verificar un webhook:', error);
		return text('upstream error', { status: 502 });
	}
	if (!verified) {
		console.warn(`[paypal] webhook rechazado (firma) ${String(event?.event_type ?? '')}`);
		return text('invalid signature', { status: 401 });
	}

	const target = webhookTarget(event);
	if (!target) return text('ignored', { status: 200 });

	let paypalOrderId;
	try {
		paypalOrderId =
			'orderId' in target
				? target.orderId
				: (await gateway.getCapture(target.captureId))?.supplementary_data?.related_ids?.order_id;
	} catch (error) {
		console.error('[paypal] el webhook no pudo leer una captura:', error);
		await reportPurchaseFailure({
			db,
			platform,
			code: 'paypal_pago',
			origin: siteOrigin(url),
			fetch
		});
		return text('upstream error', { status: 502 });
	}
	if (typeof paypalOrderId !== 'string') return text('ignored', { status: 200 });

	try {
		const result = await settleAndProcess({
			db,
			gateway,
			paypalOrderId,
			origin: siteOrigin(url),
			fetch,
			platform
		});
		return json({ ok: true, kind: result.kind, outcome: result.outcome });
	} catch (error) {
		logDBError('paypal webhook', error);
		await reportPurchaseFailure({
			db,
			platform,
			code: 'paypal_pago',
			origin: siteOrigin(url),
			fetch
		});
		return text('error', { status: 500 });
	}
}

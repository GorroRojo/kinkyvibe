/**
 * Notificaciones (webhooks) de Mercado Pago.
 *
 * 1. Verifica `x-signature` (HMAC con MP_WEBHOOK_SECRET). Sin firma válida: 401.
 * 2. NUNCA confía en el body: con el id del pago pide el pago a la API de MP y lo aplica a la
 *    orden de su `external_reference` (chequeando monto y moneda), de forma idempotente. Si el
 *    `external_reference` es `propina:<id>`, lo aplica a esa propina (docs/propinas.md).
 * 3. Contesta 200 rápido; el email se manda en segundo plano (`waitUntil`).
 *
 * Errores transitorios (base, API de MP) devuelven 5xx para que MP reintente.
 */
import { json, text } from '@sveltejs/kit';
import { getDB, logDBError } from '$lib/server/db';
import {
	getGateway,
	processPayment,
	siteOrigin,
	webhookSecret
} from '$lib/server/tickets/index.js';
import { verifyWebhookSignature } from '$lib/server/tickets/mercadopago.js';
import { applyTipPayment, isTipReference } from '$lib/server/propinas/index.js';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request, url, platform, fetch }) {
	/** @type {any} */
	let body = null;
	try {
		body = await request.json();
	} catch {
		// Algunas notificaciones viejas (IPN) vienen sin body.
	}
	const type = url.searchParams.get('type') ?? body?.type ?? null;
	const topic = url.searchParams.get('topic');
	const dataId = url.searchParams.get('data.id');

	// Formato IPN viejo (`?topic=payment&id=…`): no viene firmado. No lo procesamos; alcanza con
	// el webhook firmado y el re-chequeo de la página de estado.
	if (topic && !type) return text('ignored', { status: 200 });
	if (type !== 'payment') return text('ignored', { status: 200 });
	if (!dataId || !/^\d{1,30}$/.test(dataId)) return text('bad request', { status: 400 });

	const secret = webhookSecret();
	if (!secret) {
		console.error('[tickets] falta MP_WEBHOOK_SECRET: no se pueden verificar webhooks');
		return text('not configured', { status: 503 });
	}
	const check = await verifyWebhookSignature({
		signature: request.headers.get('x-signature'),
		requestId: request.headers.get('x-request-id'),
		dataId,
		secret
	});
	if (!check.ok) {
		console.warn(`[tickets] webhook rechazado (${check.reason}) para el pago ${dataId}`);
		return text('invalid signature', { status: 401 });
	}

	const db = getDB(platform);
	const gateway = await getGateway(fetch);
	if (!db || !gateway) return text('not configured', { status: 503 });

	/** @type {import('$lib/server/tickets/orders.js').MPPayment} */
	let payment;
	try {
		payment = await gateway.getPayment(dataId);
	} catch (error) {
		console.error(`[tickets] no se pudo obtener el pago ${dataId}:`, error);
		return text('upstream error', { status: 502 });
	}

	// Propinas (docs/propinas.md): misma cuenta, misma firma, se reconocen por `propina:<id>`.
	if (isTipReference(payment.external_reference)) {
		try {
			const result = await applyTipPayment(db, payment);
			if (result.outcome === 'unknown-tip') {
				console.warn(`[propinas] pago ${payment.id} sin propina conocida`);
			}
			return json({ ok: true, outcome: result.outcome });
		} catch (error) {
			logDBError('webhook apply tip payment', error);
			return text('error', { status: 500 });
		}
	}

	try {
		const result = await processPayment({ db, payment, origin: siteOrigin(url), fetch, platform });
		return json({ ok: true, outcome: result.outcome });
	} catch (error) {
		logDBError('webhook apply payment', error);
		return text('error', { status: 500 });
	}
}

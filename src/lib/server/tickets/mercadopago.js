/**
 * Cliente mínimo de la API REST de Mercado Pago (Checkout Pro) con `fetch`, para que corra en
 * Cloudflare Workers sin el SDK de Node.
 *
 * Docs de referencia (contrastadas con la doc oficial de MP Argentina; ver docs/tickets.md):
 * - Crear preferencia: POST https://api.mercadopago.com/checkout/preferences
 * - Obtener pago:      GET  https://api.mercadopago.com/v1/payments/{id}
 * - Buscar pagos:      GET  https://api.mercadopago.com/v1/payments/search?external_reference=…
 * - Reembolsar:        POST https://api.mercadopago.com/v1/payments/{id}/refunds (sin body =
 *   reembolso total; doc "Configurar reembolsos y cancelaciones" de Checkout Pro)
 * - Webhooks: header `x-signature: ts=…,v1=…` = HMAC-SHA256(secret,
 *   "id:{data.id};request-id:{x-request-id};ts:{ts};") en hex, con `data.id` del query string.
 */
import { timingSafeEqual } from '$lib/server/hash.js';
import { toHex } from '$lib/utils/base64.js';

export const MP_API = 'https://api.mercadopago.com';

/** Tolerancia para el `ts` de la firma del webhook. */
export const SIGNATURE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Cuánto se espera una respuesta de la API de MP. Sin límite, un MP colgado deja colgada la
 * compra (con el cupo reservado), la página de estado o el webhook.
 */
export const MP_TIMEOUT_MS = 10_000;

/**
 * @typedef {{
 *   fetch: typeof fetch,
 *   accessToken: string,
 *   timeoutMs?: number
 * }} MPClient
 */

/**
 * @param {MPClient} client
 * @param {string} path
 * @param {RequestInit} [init]
 */
async function mpFetch(client, path, init = {}) {
	const res = await client.fetch(MP_API + path, {
		...init,
		signal: AbortSignal.timeout(client.timeoutMs ?? MP_TIMEOUT_MS),
		headers: {
			Authorization: `Bearer ${client.accessToken}`,
			'Content-Type': 'application/json',
			...init.headers
		}
	});
	if (!res.ok) {
		// El cuerpo de error de MP no trae datos sensibles, pero lo recortamos igual.
		const text = (await res.text().catch(() => '')).slice(0, 500);
		throw new Error(`Mercado Pago ${init.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
	}
	return res.json();
}

/**
 * Reembolso TOTAL de un pago (`POST /v1/payments/{id}/refunds` con el body vacío, según la doc de
 * Checkout Pro). Con `X-Idempotency-Key`, así un doble click no reembolsa dos veces.
 *
 * @param {MPClient} client
 * @param {string} paymentId
 * @param {string} idempotencyKey
 * @returns {Promise<{ id: number | string, status?: string, amount?: number }>}
 */
export async function refundPayment(client, paymentId, idempotencyKey) {
	if (!/^\d{1,30}$/.test(paymentId)) throw new Error('id de pago inválido');
	return mpFetch(client, `/v1/payments/${paymentId}/refunds`, {
		method: 'POST',
		headers: { 'X-Idempotency-Key': idempotencyKey }
	});
}

/**
 * Fecha ISO 8601 con milisegundos y huso de Argentina, formato que usa MP en sus ejemplos
 * (`2026-10-01T12:00:00.000-03:00`).
 *
 * @param {number} ms
 */
export function mpDate(ms) {
	const shifted = new Date(ms - 3 * 60 * 60 * 1000).toISOString();
	return shifted.replace('Z', '-03:00');
}

/**
 * Cuerpo común de una preferencia de Checkout Pro (entradas y propinas): un solo link de vuelta
 * para los tres resultados, vencimiento, solo aprobado o rechazado y sin pagos en efectivo.
 *
 * @param {{
 *   items: { id: string, title: string, quantity: number, unit_price: number, currency_id: 'ARS' }[],
 *   externalReference: string,
 *   backUrl: string,
 *   from: number,
 *   to: number,
 *   payer?: { email: string, name: string }
 * }} input
 */
export function checkoutProPreference({ items, externalReference, backUrl, from, to, payer }) {
	return {
		items: items.map((i) => ({ ...i, title: i.title.slice(0, 250) })),
		...(payer ? { payer } : {}),
		external_reference: externalReference,
		back_urls: { success: backUrl, failure: backUrl, pending: backUrl },
		auto_return: /** @type {const} */ ('approved'),
		// Sin `notification_url`: los webhooks llegan a la URL configurada en Tus integraciones →
		// Webhooks, que es el canal que la doc de MP documenta como firmado (x-signature). Una
		// `notification_url` en la preferencia tiene prioridad sobre esa URL, su firma no está
		// documentada y la doc aclara que con credenciales de prueba no envía notificaciones.
		expires: true,
		expiration_date_from: mpDate(from),
		expiration_date_to: mpDate(to),
		// Solo aprobado o rechazado, sin "pendiente": la reserva de cupo es corta.
		binary_mode: true,
		// Sin pagos en efectivo (Rapipago/Pago Fácil), que se acreditan días después.
		payment_methods: {
			excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
			installments: 1
		},
		statement_descriptor: 'KINKYVIBE'
	};
}

/**
 * Cuerpo de la preferencia de Checkout Pro para una orden.
 *
 * @param {{
 *   order: { id: string, ticket_type: string, quantity: number, unit_price: number, total?: number, buyer_email: string, buyer_name: string, expires_at: number, created_at: number },
 *   eventTitle: string,
 *   typeName: string,
 *   origin: string
 * }} input
 */
export function buildPreference({ order, eventTitle, typeName, origin }) {
	// Si el total no es precio × cantidad (fondo, código de descuento o recargo), un solo ítem
	// por el total: MP no acepta ítems negativos y el webhook compara lo pagado con `orders.total`.
	const single = order.total !== undefined && order.total !== order.unit_price * order.quantity;
	const title = single
		? `${order.quantity} × Entrada ${typeName} · ${eventTitle}`
		: `Entrada ${typeName} · ${eventTitle}`;
	return checkoutProPreference({
		items: [
			{
				id: `${order.ticket_type}`,
				title,
				quantity: single ? 1 : order.quantity,
				unit_price: single ? /** @type {number} */ (order.total) : order.unit_price,
				currency_id: 'ARS'
			}
		],
		payer: { email: order.buyer_email, name: order.buyer_name },
		externalReference: order.id,
		backUrl: `${origin}/entradas/${order.id}/estado`,
		// La preferencia vence junto con la reserva de cupo.
		from: order.created_at,
		to: order.expires_at
	});
}

/**
 * El detalle de un ítem de la preferencia para mostrar («2 × Entrada General · Fiesta»). Cuando
 * la orden va como un solo ítem por el total, la cantidad ya está en el título (y `quantity` es
 * 1): no se repite (el checkout simulado mostraba «1 × 2 × Entrada General»).
 *
 * @param {{ title: string, quantity: number }} item
 */
export function itemDetail(item) {
	return item.quantity === 1 ? item.title : `${item.quantity} × ${item.title}`;
}

/**
 * @param {MPClient} client
 * @param {ReturnType<typeof checkoutProPreference>} preference
 * @param {string} idempotencyKey
 * @returns {Promise<{ id: string, init_point: string, sandbox_init_point?: string }>}
 */
export async function createPreference(client, preference, idempotencyKey) {
	return mpFetch(client, '/checkout/preferences', {
		method: 'POST',
		headers: { 'X-Idempotency-Key': idempotencyKey },
		body: JSON.stringify(preference)
	});
}

/**
 * @param {MPClient} client
 * @param {string} paymentId
 * @returns {Promise<import('./orders.js').MPPayment>}
 */
export async function getPayment(client, paymentId) {
	if (!/^\d{1,30}$/.test(paymentId)) throw new Error('Id de pago inválido');
	return mpFetch(client, `/v1/payments/${paymentId}`);
}

/**
 * Último pago asociado a una orden (por si el webhook todavía no llegó y no hay payment_id).
 *
 * @param {MPClient} client
 * @param {string} orderId
 * @returns {Promise<import('./orders.js').MPPayment | null>}
 */
export async function findPaymentByOrder(client, orderId) {
	const params = new URLSearchParams({
		external_reference: orderId,
		sort: 'date_created',
		criteria: 'desc',
		limit: '5'
	});
	/** @type {{ results?: import('./orders.js').MPPayment[] }} */
	const data = await mpFetch(client, `/v1/payments/search?${params}`);
	const results = data.results ?? [];
	return results.find((p) => p.status === 'approved') ?? results[0] ?? null;
}

/* --------------------------------- Firma del webhook --------------------------------- */

/**
 * @param {string} secret
 * @param {string} message
 */
export async function hmacSha256Hex(secret, message) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
	return toHex(sig);
}

/**
 * Arma el manifiesto que firma MP. Las partes que faltan se omiten, como indica la doc.
 *
 * @param {{ dataId: string | null, requestId: string | null, ts: string }} parts
 */
export function signatureManifest({ dataId, requestId, ts }) {
	let manifest = '';
	// La doc pide pasar a minúsculas los ids alfanuméricos.
	if (dataId) manifest += `id:${dataId.toLowerCase()};`;
	if (requestId) manifest += `request-id:${requestId};`;
	manifest += `ts:${ts};`;
	return manifest;
}

/**
 * Verifica el header `x-signature` de una notificación de MP.
 *
 * @param {{
 *   signature: string | null,
 *   requestId: string | null,
 *   dataId: string | null,
 *   secret: string,
 *   now?: number,
 *   maxAgeMs?: number
 * }} input
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'missing' | 'malformed' | 'stale' | 'mismatch' }>}
 */
export async function verifyWebhookSignature({
	signature,
	requestId,
	dataId,
	secret,
	now = Date.now(),
	maxAgeMs = SIGNATURE_MAX_AGE_MS
}) {
	if (!signature || !secret) return { ok: false, reason: 'missing' };
	/** @type {Record<string, string>} */
	const parts = {};
	for (const piece of signature.split(',')) {
		const [k, ...rest] = piece.split('=');
		if (k && rest.length) parts[k.trim()] = rest.join('=').trim();
	}
	const { ts, v1 } = parts;
	if (!ts || !v1 || !/^\d{1,16}$/.test(ts) || !/^[0-9a-f]{64}$/i.test(v1)) {
		return { ok: false, reason: 'malformed' };
	}
	// La doc dice que `ts` está en milisegundos (y así es su ejemplo principal), pero otros
	// ejemplos de la misma doc lo muestran en segundos: aceptamos ambos.
	const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
	if (Math.abs(now - tsMs) > maxAgeMs) return { ok: false, reason: 'stale' };
	const expected = await hmacSha256Hex(secret, signatureManifest({ dataId, requestId, ts }));
	return timingSafeEqual(expected, v1.toLowerCase())
		? { ok: true }
		: { ok: false, reason: 'mismatch' };
}

/**
 * Firma como lo haría MP (para el checkout simulado y los tests).
 *
 * @param {{ dataId: string, requestId: string, secret: string, now?: number }} input
 */
export async function signWebhook({ dataId, requestId, secret, now = Date.now() }) {
	// En milisegundos, como dice la doc de MP.
	const ts = String(Math.floor(now));
	const v1 = await hmacSha256Hex(secret, signatureManifest({ dataId, requestId, ts }));
	return `ts=${ts},v1=${v1}`;
}

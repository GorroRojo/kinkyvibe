/**
 * Cliente mínimo de la API REST de PayPal (Orders v2) con `fetch`, para que corra en Cloudflare
 * Workers sin el SDK (docs/paypal.md, decisión 0059).
 *
 * - Token: POST /v1/oauth2/token (client credentials, Basic id:secreto). Se guarda en memoria del
 *   Worker hasta un minuto antes de que venza, por entorno y client id.
 * - Crear orden:   POST /v2/checkout/orders (con `PayPal-Request-Id`: idempotente)
 * - Ver orden:     GET  /v2/checkout/orders/{id}
 * - Capturar:      POST /v2/checkout/orders/{id}/capture (con `PayPal-Request-Id`)
 * - Ver captura:   GET  /v2/payments/captures/{id}
 * - Reembolsar:    POST /v2/payments/captures/{id}/refund (sin monto = total; con `PayPal-Request-Id`)
 * - Webhooks:      POST /v1/notifications/verify-webhook-signature (con el `webhook_id` de la app)
 *
 * Nunca se confía en lo que llega del navegador ni en el cuerpo de un webhook: el estado de un
 * pago sale siempre de pedirle la orden a la API (`getOrder`).
 */

/** Las dos bases de la API: sandbox (pruebas) y live (de verdad), según `PAYPAL_ENV`. */
export const PAYPAL_API = Object.freeze({
	sandbox: 'https://api-m.sandbox.paypal.com',
	live: 'https://api-m.paypal.com'
});

/** Cuánto se espera una respuesta de PayPal (como con Mercado Pago: sin límite cuelga la compra). */
export const PAYPAL_TIMEOUT_MS = 10_000;

/** Margen para renovar el token antes de que venza. */
const TOKEN_MARGIN_MS = 60_000;

/**
 * @typedef {{
 *   fetch: typeof fetch,
 *   clientId: string,
 *   clientSecret: string,
 *   env: 'sandbox' | 'live',
 *   timeoutMs?: number
 * }} PaypalClient
 */

/**
 * Tokens en memoria del Worker (por isolate). Clave: entorno + client id.
 * @type {Map<string, { token: string, expiresAt: number }>}
 */
const tokens = new Map();

/** Solo para los tests. */
export function clearTokenCache() {
	tokens.clear();
}

/**
 * `PAYPAL_ENV` como entorno de la API: `live` solo si dice exactamente eso; cualquier otra cosa
 * (o nada) es sandbox, así un error de tipeo nunca cobra de verdad.
 *
 * @param {unknown} raw
 * @returns {'sandbox' | 'live'}
 */
export function paypalEnvFrom(raw) {
	return String(raw ?? '').trim() === 'live' ? 'live' : 'sandbox';
}

/** @param {string} s */
function base64(s) {
	return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

/**
 * Un token de acceso (del caché si sigue vigente).
 *
 * @param {PaypalClient} client
 * @param {number} [now]
 */
export async function getAccessToken(client, now = Date.now()) {
	const key = `${client.env}:${client.clientId}`;
	const cached = tokens.get(key);
	if (cached && cached.expiresAt - TOKEN_MARGIN_MS > now) return cached.token;
	const res = await client.fetch(`${PAYPAL_API[client.env]}/v1/oauth2/token`, {
		method: 'POST',
		signal: AbortSignal.timeout(client.timeoutMs ?? PAYPAL_TIMEOUT_MS),
		headers: {
			Authorization: `Basic ${base64(`${client.clientId}:${client.clientSecret}`)}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json'
		},
		body: 'grant_type=client_credentials'
	});
	if (!res.ok) {
		// Sin el cuerpo: puede decir algo de las credenciales.
		throw new Error(`PayPal token → ${res.status}`);
	}
	/** @type {any} */
	const json = await res.json();
	if (typeof json?.access_token !== 'string' || !json.access_token) {
		throw new Error('PayPal token: respuesta sin access_token');
	}
	const ttl = Number(json.expires_in);
	tokens.set(key, {
		token: json.access_token,
		expiresAt: now + (Number.isFinite(ttl) && ttl > 0 ? ttl * 1000 : 5 * 60 * 1000)
	});
	return json.access_token;
}

/** Error de la API con el estado HTTP y el `name` de PayPal (p. ej. `UNPROCESSABLE_ENTITY`). */
export class PaypalError extends Error {
	/**
	 * @param {string} message
	 * @param {number} status
	 * @param {string | null} issue el primer `details[].issue` (p. ej. `ORDER_ALREADY_CAPTURED`)
	 */
	constructor(message, status, issue) {
		super(message);
		this.status = status;
		this.issue = issue;
	}
}

/**
 * @param {PaypalClient} client
 * @param {string} path
 * @param {RequestInit & { requestId?: string }} [init]
 */
async function ppFetch(client, path, init = {}) {
	const { requestId, ...rest } = init;
	const send = async (/** @type {string} */ token) =>
		client.fetch(PAYPAL_API[client.env] + path, {
			...rest,
			signal: AbortSignal.timeout(client.timeoutMs ?? PAYPAL_TIMEOUT_MS),
			headers: {
				Authorization: `Bearer ${token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
				Prefer: 'return=representation',
				...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
				...rest.headers
			}
		});
	let res = await send(await getAccessToken(client));
	if (res.status === 401) {
		// El token cacheado pudo haberse revocado: uno nuevo, una sola vez.
		tokens.delete(`${client.env}:${client.clientId}`);
		res = await send(await getAccessToken(client));
	}
	if (!res.ok) {
		const text = (await res.text().catch(() => '')).slice(0, 500);
		/** @type {string | null} */
		let issue = null;
		try {
			issue = JSON.parse(text)?.details?.[0]?.issue ?? null;
		} catch {
			// no era JSON
		}
		throw new PaypalError(
			`PayPal ${rest.method ?? 'GET'} ${path} → ${res.status}: ${text}`,
			res.status,
			issue
		);
	}
	return res.json();
}

const ID_RE = /^[A-Z0-9]{5,40}$/;

/** @param {unknown} id */
export function isPaypalId(id) {
	return typeof id === 'string' && ID_RE.test(id);
}

/** @param {string} id */
function checkId(id) {
	if (!isPaypalId(id)) throw new Error('id de PayPal inválido');
	return id;
}

/**
 * @param {PaypalClient} client
 * @param {object} body
 * @param {string} requestId
 * @returns {Promise<any>}
 */
export function createOrder(client, body, requestId) {
	return ppFetch(client, '/v2/checkout/orders', {
		method: 'POST',
		body: JSON.stringify(body),
		requestId
	});
}

/**
 * @param {PaypalClient} client
 * @param {string} id
 * @returns {Promise<any>}
 */
export function getOrder(client, id) {
	return ppFetch(client, `/v2/checkout/orders/${checkId(id)}`);
}

/**
 * Captura una orden aprobada. Si ya estaba capturada (otra pestaña, el webhook), devuelve la orden
 * como está: capturar es idempotente para quien llama.
 *
 * @param {PaypalClient} client
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function captureOrder(client, id) {
	try {
		return await ppFetch(client, `/v2/checkout/orders/${checkId(id)}/capture`, {
			method: 'POST',
			body: '{}',
			requestId: `capture-${id}`
		});
	} catch (error) {
		if (error instanceof PaypalError && error.issue === 'ORDER_ALREADY_CAPTURED') {
			return getOrder(client, id);
		}
		throw error;
	}
}

/**
 * @param {PaypalClient} client
 * @param {string} id
 * @returns {Promise<any>}
 */
export function getCapture(client, id) {
	return ppFetch(client, `/v2/payments/captures/${checkId(id)}`);
}

/**
 * Reembolso TOTAL de una captura (sin `amount`).
 *
 * @param {PaypalClient} client
 * @param {string} captureId
 * @param {string} requestId
 * @returns {Promise<{ id: string, status?: string }>}
 */
export function refundCapture(client, captureId, requestId) {
	return ppFetch(client, `/v2/payments/captures/${checkId(captureId)}/refund`, {
		method: 'POST',
		body: '{}',
		requestId
	});
}

/** Los headers de PayPal que hacen falta para verificar un webhook. */
export const WEBHOOK_HEADERS = Object.freeze({
	auth_algo: 'paypal-auth-algo',
	cert_url: 'paypal-cert-url',
	transmission_id: 'paypal-transmission-id',
	transmission_sig: 'paypal-transmission-sig',
	transmission_time: 'paypal-transmission-time'
});

/**
 * Verifica la firma de un webhook con la API de PayPal (`verify-webhook-signature`). Sin alguno de
 * los headers, sin `webhookId` o si PayPal no contesta `SUCCESS`: `false`.
 *
 * @param {PaypalClient} client
 * @param {{ headers: Headers, event: unknown, webhookId: string }} input
 */
export async function verifyWebhook(client, { headers, event, webhookId }) {
	if (!webhookId) return false;
	/** @type {Record<string, string>} */
	const fields = {};
	for (const [field, header] of Object.entries(WEBHOOK_HEADERS)) {
		const value = headers.get(header);
		if (!value) return false;
		fields[field] = value;
	}
	// El certificado tiene que ser de PayPal (la API lo vuelve a mirar, pero no le mandamos
	// cualquier URL).
	try {
		const cert = new URL(fields.cert_url);
		if (cert.protocol !== 'https:' || !/(^|\.)paypal\.com$/.test(cert.hostname)) return false;
	} catch {
		return false;
	}
	/** @type {any} */
	const res = await ppFetch(client, '/v1/notifications/verify-webhook-signature', {
		method: 'POST',
		body: JSON.stringify({ ...fields, webhook_id: webhookId, webhook_event: event })
	});
	return res?.verification_status === 'SUCCESS';
}

/** El link al que se manda a la persona para aprobar el pago (`payer-action` o `approve`). */
export function approveLink(/** @type {any} */ order) {
	const links = Array.isArray(order?.links) ? order.links : [];
	const link = links.find(
		(/** @type {any} */ l) => l?.rel === 'payer-action' || l?.rel === 'approve'
	);
	return typeof link?.href === 'string' ? link.href : null;
}

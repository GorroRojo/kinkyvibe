import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	approveLink,
	captureOrder,
	clearTokenCache,
	getAccessToken,
	isPaypalId,
	paypalEnvFrom,
	refundCapture,
	verifyWebhook
} from './client.js';

afterEach(() => clearTokenCache());

/** Respuestas en orden; guarda los pedidos. @param {Array<{ status?: number, body: unknown }>} replies */
function fakeFetch(replies) {
	/** @type {{ url: string, init: RequestInit }[]} */
	const calls = [];
	const fn = vi.fn(async (/** @type {string} */ url, /** @type {RequestInit} */ init) => {
		calls.push({ url, init });
		const r = replies.shift() ?? { status: 500, body: {} };
		return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
	});
	return { fetch: /** @type {typeof fetch} */ (/** @type {unknown} */ (fn)), calls };
}

const TOKEN = { body: { access_token: 'tok-1', expires_in: 3600 } };

/** @param {typeof fetch} f @param {'sandbox' | 'live'} [env] */
const client = (f, env = 'sandbox') => ({
	fetch: f,
	clientId: 'id-de-prueba',
	clientSecret: 'secreto-de-prueba',
	env
});

describe('cliente de PayPal', () => {
	it('PAYPAL_ENV: live solo si dice exactamente live', () => {
		expect(paypalEnvFrom('live')).toBe('live');
		expect(paypalEnvFrom(' live ')).toBe('live');
		expect(paypalEnvFrom('Live')).toBe('sandbox');
		expect(paypalEnvFrom(undefined)).toBe('sandbox');
		expect(paypalEnvFrom('produccion')).toBe('sandbox');
	});

	it('pide el token con client credentials y lo guarda hasta que vence', async () => {
		const { fetch, calls } = fakeFetch([TOKEN]);
		const c = client(fetch);
		const now = 1_000_000;
		expect(await getAccessToken(c, now)).toBe('tok-1');
		expect(await getAccessToken(c, now + 60_000)).toBe('tok-1');
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token');
		expect(calls[0].init.body).toBe('grant_type=client_credentials');
		const auth = new Headers(calls[0].init.headers).get('authorization');
		expect(auth).toBe(`Basic ${btoa('id-de-prueba:secreto-de-prueba')}`);
	});

	it('renueva el token un minuto antes de que venza', async () => {
		const { fetch, calls } = fakeFetch([
			TOKEN,
			{ body: { access_token: 'tok-2', expires_in: 3600 } }
		]);
		const c = client(fetch, 'live');
		await getAccessToken(c, 0);
		expect(await getAccessToken(c, 3600_000 - 30_000)).toBe('tok-2');
		expect(calls[1].url).toBe('https://api-m.paypal.com/v1/oauth2/token');
	});

	it('un error del token no muestra el cuerpo (puede hablar de las credenciales)', async () => {
		const { fetch } = fakeFetch([{ status: 401, body: { error: 'invalid_client secreto' } }]);
		await expect(getAccessToken(client(fetch))).rejects.toThrow(/^PayPal token → 401$/);
	});

	it('capturar una orden ya capturada devuelve la orden (idempotente)', async () => {
		const { fetch, calls } = fakeFetch([
			TOKEN,
			{
				status: 422,
				body: { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] }
			},
			{ body: { id: 'ORDER12345', status: 'COMPLETED' } }
		]);
		const order = await captureOrder(client(fetch), 'ORDER12345');
		expect(order.status).toBe('COMPLETED');
		expect(calls[1].url).toMatch(/\/v2\/checkout\/orders\/ORDER12345\/capture$/);
		expect(new Headers(calls[1].init.headers).get('paypal-request-id')).toBe('capture-ORDER12345');
		expect(calls[2].init.method ?? 'GET').toBe('GET');
	});

	it('reembolso total con PayPal-Request-Id; ids raros no salen', async () => {
		const { fetch, calls } = fakeFetch([TOKEN, { body: { id: 'REF1', status: 'COMPLETED' } }]);
		await refundCapture(client(fetch), 'CAPTURE123', 'refund-orden');
		expect(calls[1].url).toMatch(/\/v2\/payments\/captures\/CAPTURE123\/refund$/);
		expect(new Headers(calls[1].init.headers).get('paypal-request-id')).toBe('refund-orden');
		expect(() => refundCapture(client(fetch), '../v1/x', 'k')).toThrow(/inválido/);
		expect(isPaypalId('5O190127TN364715T')).toBe(true);
		expect(isPaypalId('abc/../')).toBe(false);
	});

	it('el link para aprobar: payer-action o approve', () => {
		expect(
			approveLink({ links: [{ rel: 'payer-action', href: 'https://www.paypal.com/x' }] })
		).toBe('https://www.paypal.com/x');
		expect(approveLink({ links: [{ rel: 'approve', href: 'https://www.paypal.com/y' }] })).toBe(
			'https://www.paypal.com/y'
		);
		expect(approveLink({ links: [{ rel: 'self', href: 'x' }] })).toBeNull();
	});
});

describe('verificación del webhook', () => {
	const headers = () =>
		new Headers({
			'paypal-auth-algo': 'SHA256withRSA',
			'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
			'paypal-transmission-id': 'tx-1',
			'paypal-transmission-sig': 'firma',
			'paypal-transmission-time': '2026-11-10T12:00:00Z'
		});
	const event = { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: {} };

	it('le pregunta a PayPal con los headers, el webhook_id y el evento', async () => {
		const { fetch, calls } = fakeFetch([TOKEN, { body: { verification_status: 'SUCCESS' } }]);
		expect(
			await verifyWebhook(client(fetch), { headers: headers(), event, webhookId: 'WH-ID' })
		).toBe(true);
		expect(calls[1].url).toMatch(/\/v1\/notifications\/verify-webhook-signature$/);
		const sent = JSON.parse(String(calls[1].init.body));
		expect(sent).toEqual({
			auth_algo: 'SHA256withRSA',
			cert_url: 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1',
			transmission_id: 'tx-1',
			transmission_sig: 'firma',
			transmission_time: '2026-11-10T12:00:00Z',
			webhook_id: 'WH-ID',
			webhook_event: event
		});
	});

	it('FAILURE, sin headers, sin webhook id o certificado de otra web: false', async () => {
		const { fetch } = fakeFetch([TOKEN, { body: { verification_status: 'FAILURE' } }]);
		const c = client(fetch);
		expect(await verifyWebhook(c, { headers: headers(), event, webhookId: 'WH-ID' })).toBe(false);
		expect(await verifyWebhook(c, { headers: new Headers(), event, webhookId: 'WH-ID' })).toBe(
			false
		);
		expect(await verifyWebhook(c, { headers: headers(), event, webhookId: '' })).toBe(false);
		const bad = headers();
		bad.set('paypal-cert-url', 'https://paypal.com.example.org/cert');
		expect(await verifyWebhook(c, { headers: bad, event, webhookId: 'WH-ID' })).toBe(false);
	});
});

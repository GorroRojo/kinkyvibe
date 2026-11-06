/**
 * El cliente de PayPal según el entorno (docs/paypal.md): el de verdad (sandbox o live, por
 * `PAYPAL_ENV`), el simulado (solo `vite dev` con `PAYPAL_MOCK=1`) o `null` si faltan las
 * credenciales. Las credenciales son secretos de Cloudflare: `PAYPAL_CLIENT_ID`,
 * `PAYPAL_CLIENT_SECRET` y `PAYPAL_WEBHOOK_ID` (nunca en el repo).
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { isFlagOn } from '$lib/server/flags.js';
import {
	captureOrder,
	createOrder,
	getCapture,
	getOrder,
	paypalEnvFrom,
	refundCapture,
	verifyWebhook
} from './client.js';

/**
 * @typedef {{
 *   mock: boolean,
 *   env: 'sandbox' | 'live',
 *   createOrder: (body: object, requestId: string) => Promise<any>,
 *   getOrder: (id: string) => Promise<any>,
 *   captureOrder: (id: string) => Promise<any>,
 *   getCapture: (id: string) => Promise<any>,
 *   refundCapture: (captureId: string, requestId: string) => Promise<{ id: string, status?: string }>,
 *   verifyWebhook: (input: { headers: Headers, event: unknown }) => Promise<boolean>
 * }} PaypalGateway
 */

/**
 * `true` solo en `vite dev` con `PAYPAL_MOCK=1`. `dev` es `false` en el build: en producción el
 * simulado no existe.
 */
export function isPaypalMock() {
	return dev && env.PAYPAL_MOCK === '1';
}

/** ¿Están las tres credenciales (o el simulado)? */
export function paypalConfigured() {
	return (
		isPaypalMock() ||
		Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET && env.PAYPAL_WEBHOOK_ID)
	);
}

/**
 * ¿Se puede cobrar con PayPal? El interruptor `paypal` prendido y las credenciales cargadas (la
 * cotización del día se mira aparte: `chargeQuote`).
 *
 * @param {import('@cloudflare/workers-types').D1Database | null | undefined} db
 */
export async function paypalCharging(db) {
	if (!paypalConfigured()) return false;
	return isFlagOn(db, 'paypal');
}

/**
 * @param {typeof fetch} fetchFn
 * @returns {Promise<PaypalGateway | null>}
 */
export async function getPaypalGateway(fetchFn) {
	if (dev && isPaypalMock()) {
		const { mockPaypalGateway } = await import('./mock.js');
		return mockPaypalGateway;
	}
	const clientId = env.PAYPAL_CLIENT_ID;
	const clientSecret = env.PAYPAL_CLIENT_SECRET;
	if (!clientId || !clientSecret) return null;
	const client = {
		fetch: fetchFn,
		clientId,
		clientSecret,
		env: paypalEnvFrom(env.PAYPAL_ENV)
	};
	return {
		mock: false,
		env: client.env,
		createOrder: (body, requestId) => createOrder(client, body, requestId),
		getOrder: (id) => getOrder(client, id),
		captureOrder: (id) => captureOrder(client, id),
		getCapture: (id) => getCapture(client, id),
		refundCapture: (id, requestId) => refundCapture(client, id, requestId),
		verifyWebhook: ({ headers, event }) =>
			verifyWebhook(client, { headers, event, webhookId: env.PAYPAL_WEBHOOK_ID ?? '' })
	};
}

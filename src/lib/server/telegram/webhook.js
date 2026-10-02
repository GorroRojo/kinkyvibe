/**
 * El webhook de Telegram (decisión 0029), separado de la ruta para poder probarlo sin SvelteKit.
 *
 * 1. Verifica el header `x-telegram-bot-api-secret-token` (el secreto que se pasó a `setWebhook`)
 *    en tiempo constante. Sin secreto configurado o con uno inválido: 503 / 401.
 * 2. Con el interruptor `telegram_bot` apagado contesta 200 sin hacer nada: un error haría que
 *    Telegram reintente y acumule pedidos.
 * 3. Contesta con el mismo pedido (Telegram acepta un método de la API como respuesta).
 */
import { json } from '@sveltejs/kit';
import { sha256Hex, timingSafeEqual } from '$lib/server/hash.js';
import { handleUpdate } from './router.js';

/** Largo mínimo del secreto (más corto se considera no configurado). */
export const MIN_WEBHOOK_SECRET_LENGTH = 16;

/** Tamaño máximo del pedido: un update de Telegram con un mensaje pesa unos pocos KB. */
export const MAX_BODY_BYTES = 64 * 1024;

/**
 * @param {string | null | undefined} given
 * @param {string | undefined} expected
 */
export async function isValidWebhookSecret(given, expected) {
	if (!expected || expected.length < MIN_WEBHOOK_SECRET_LENGTH || !given) return false;
	return timingSafeEqual(await sha256Hex(given), await sha256Hex(expected));
}

/**
 * @param {{
 *   request: Request,
 *   secret: string | undefined,
 *   enabled: boolean,
 *   origin: string,
 *   listUpcoming: import('./router.js').Deps['listUpcoming'],
 *   accounts?: import('./router.js').Deps['accounts']
 * }} args `accounts`: la fase 2 (vincular cuentas); se llama solo para esos comandos y da `null`
 *   con `lo_que_sigo` o `cuentas` apagado
 */
export async function handleWebhook({ request, secret, enabled, origin, listUpcoming, accounts }) {
	if (!secret || secret.length < MIN_WEBHOOK_SECRET_LENGTH) {
		console.error('[telegram] falta TELEGRAM_WEBHOOK_SECRET: no se pueden verificar pedidos');
		return new Response('not configured', { status: 503 });
	}
	const given = request.headers.get('x-telegram-bot-api-secret-token');
	if (!(await isValidWebhookSecret(given, secret))) {
		return new Response('unauthorized', { status: 401 });
	}
	// El secreto se chequea antes que el interruptor: así nadie sin él puede ver si está prendido.
	if (!enabled) return new Response(null, { status: 200 });

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) return new Response('too large', { status: 413 });
	/** @type {unknown} */
	let update;
	try {
		update = JSON.parse(text);
	} catch {
		return new Response('bad request', { status: 400 });
	}
	const response = await handleUpdate(update, { listUpcoming, origin, accounts });
	return response ? json(response) : new Response(null, { status: 200 });
}

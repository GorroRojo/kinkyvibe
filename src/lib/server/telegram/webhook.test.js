import { describe, expect, it, vi } from 'vitest';
import { MAX_BODY_BYTES, handleWebhook, isValidWebhookSecret } from './webhook.js';

const SECRET = 'un-secreto-de-prueba-largo';
const ORIGIN = 'https://ejemplo.test';
const EVENTS = [
	{
		slug: 'fiesta-inventada-2031-02',
		title: 'Fiesta inventada',
		start: '2031-02-14T23:00:00-03:00'
	}
];

/**
 * @param {{ body?: string, secret?: string | null }} [opts]
 */
function req({ body, secret = SECRET } = {}) {
	/** @type {Record<string, string>} */
	const headers = { 'content-type': 'application/json' };
	if (secret !== null) headers['x-telegram-bot-api-secret-token'] = secret;
	return new Request(`${ORIGIN}/api/telegram`, {
		method: 'POST',
		headers,
		body: body ?? JSON.stringify({ message: { chat: { id: 7 }, text: '/proximos' } })
	});
}

/** @param {Partial<Parameters<typeof handleWebhook>[0]>} [over] */
const run = (over = {}) =>
	handleWebhook({
		request: req(),
		secret: SECRET,
		enabled: true,
		origin: ORIGIN,
		listUpcoming: async () => EVENTS,
		...over
	});

describe('isValidWebhookSecret', () => {
	it('acepta solo el secreto exacto', async () => {
		expect(await isValidWebhookSecret(SECRET, SECRET)).toBe(true);
		expect(await isValidWebhookSecret('otro-secreto-de-prueba', SECRET)).toBe(false);
		expect(await isValidWebhookSecret(null, SECRET)).toBe(false);
	});

	it('un secreto configurado muy corto o vacío no sirve', async () => {
		expect(await isValidWebhookSecret('corto', 'corto')).toBe(false);
		expect(await isValidWebhookSecret('x', undefined)).toBe(false);
	});
});

describe('handleWebhook', () => {
	it('sin secreto configurado: 503', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect((await run({ secret: undefined })).status).toBe(503);
		spy.mockRestore();
	});

	it('sin header o con header equivocado: 401', async () => {
		expect((await run({ request: req({ secret: null }) })).status).toBe(401);
		expect((await run({ request: req({ secret: 'otro-secreto-de-prueba' }) })).status).toBe(401);
	});

	it('con el interruptor apagado: 200 vacío, sin leer eventos', async () => {
		const listUpcoming = vi.fn(async () => EVENTS);
		const res = await run({ enabled: false, listUpcoming });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('');
		expect(listUpcoming).not.toHaveBeenCalled();
	});

	it('apagado y sin secreto válido sigue siendo 401 (no revela el estado)', async () => {
		expect(
			(await run({ enabled: false, request: req({ secret: 'otro-secreto-de-prueba' }) })).status
		).toBe(401);
	});

	it('contesta el comando en el mismo pedido', async () => {
		const res = await run();
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ method: 'sendMessage', chat_id: 7, parse_mode: 'HTML' });
		expect(body.text).toContain('Fiesta inventada');
	});

	it('200 vacío si no hay nada que contestar', async () => {
		const res = await run({ request: req({ body: JSON.stringify({ update_id: 1 }) }) });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('');
	});

	it('400 si el body no es JSON, 413 si es enorme', async () => {
		expect((await run({ request: req({ body: 'no es json' }) })).status).toBe(400);
		const big = JSON.stringify({ x: 'a'.repeat(MAX_BODY_BYTES) });
		expect((await run({ request: req({ body: big }) })).status).toBe(413);
	});
});

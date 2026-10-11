import { describe, expect, it } from 'vitest';
import { WEBHOOK_ALLOWED_UPDATES, WEBHOOK_URL, setWebhookParams } from './updates.js';

describe('allowed_updates del webhook', () => {
	it('pide los mensajes, los botones y el modo inline', () => {
		expect(WEBHOOK_ALLOWED_UPDATES).toEqual(
			expect.arrayContaining(['message', 'callback_query', 'inline_query'])
		);
	});

	it('setWebhook lleva la dirección, el secreto y esa lista', () => {
		const params = setWebhookParams({ secret: 'un-secreto-de-prueba-largo' });
		expect(params).toEqual({
			url: WEBHOOK_URL,
			secret_token: 'un-secreto-de-prueba-largo',
			allowed_updates: [...WEBHOOK_ALLOWED_UPDATES]
		});
		expect(params.allowed_updates).toContain('inline_query');
		expect(WEBHOOK_URL).toBe('https://kinkyvibe.ar/api/telegram');
	});
});

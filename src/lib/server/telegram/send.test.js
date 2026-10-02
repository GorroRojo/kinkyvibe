/**
 * Mandar por la API de Telegram (fase 2): `fetch` de mentira, token inventado. Nunca sale nada a
 * la red.
 */
import { describe, expect, it, vi } from 'vitest';
import { sendTelegramMessage, telegramSender } from './send.js';
import { argentinaHour, isQuietHour } from './quiet.js';

const TOKEN = '000000:token-inventado-para-pruebas';

/** @param {number} status */
const fakeFetch = (status) =>
	vi.fn(
		async (/** @type {any} */ _url, /** @type {any} */ _init) => new Response('{}', { status })
	);

describe('sendTelegramMessage', () => {
	it('manda un sendMessage con HTML y sin vista previa', async () => {
		const f = fakeFetch(200);
		expect(
			await sendTelegramMessage({ token: TOKEN, chatId: '42', text: '<b>Hola</b>', fetch: f })
		).toBe('sent');
		const [url, init] = f.mock.calls[0];
		expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({
			chat_id: '42',
			text: '<b>Hola</b>',
			parse_mode: 'HTML',
			link_preview_options: { is_disabled: true }
		});
	});

	it('403: el chat ya no recibe (bloqueó al bot)', async () => {
		expect(
			await sendTelegramMessage({ token: TOKEN, chatId: '42', text: 'x', fetch: fakeFetch(403) })
		).toBe('blocked');
	});

	it('otros errores o sin red: falló, sin loguear el token', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(
			await sendTelegramMessage({ token: TOKEN, chatId: '42', text: 'x', fetch: fakeFetch(500) })
		).toBe('failed');
		const boom = vi.fn(async () => {
			throw new TypeError(`no hay red para ${TOKEN}`);
		});
		expect(await sendTelegramMessage({ token: TOKEN, chatId: '42', text: 'x', fetch: boom })).toBe(
			'failed'
		);
		expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
		spy.mockRestore();
	});
});

describe('telegramSender', () => {
	it('sin token: null y una línea en el log', () => {
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		expect(telegramSender(undefined)).toBeNull();
		expect(telegramSender('')).toBeNull();
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('falta TELEGRAM_BOT_TOKEN'));
		spy.mockRestore();
	});

	it('con token: manda por ese chat', async () => {
		const f = fakeFetch(200);
		const send = telegramSender(TOKEN, f);
		expect(await send?.('7', 'hola')).toBe('sent');
		expect(JSON.parse(f.mock.calls[0][1].body).chat_id).toBe('7');
	});
});

describe('horario de silencio (23 a 9, hora de Argentina)', () => {
	const at = (/** @type {string} */ hhmm) => Date.parse(`2031-01-10T${hhmm}:00-03:00`);

	it('lee la hora de Argentina aunque el instante esté en UTC', () => {
		expect(argentinaHour(Date.parse('2031-01-11T02:30:00Z'))).toBe(23);
	});

	it('de 23:00 a 8:59 no se manda; desde las 9:00 y hasta las 22:59, sí', () => {
		for (const h of ['23:00', '23:59', '00:00', '03:00', '08:59'])
			expect(isQuietHour(at(h))).toBe(true);
		for (const h of ['09:00', '12:00', '22:59']) expect(isQuietHour(at(h))).toBe(false);
	});
});

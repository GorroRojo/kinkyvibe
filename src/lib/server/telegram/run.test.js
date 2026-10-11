/**
 * Correr un plan con el token: 429 sin reintentos, «message is not modified», fallback y que el
 * token nunca salga. `fetch` de mentira: nunca sale nada a la red.
 */
import { describe, expect, it, vi } from 'vitest';
import { SLOW_DOWN_TEXT, runPlan, telegramCaller } from './run.js';

const TOKEN = '000000:token-inventado-para-pruebas';

/**
 * `fetch` de mentira: `respond(method)` da `{ status, body }`.
 *
 * @param {(method: string) => { status?: number, body?: unknown }} [respond]
 */
function fakeFetch(respond = () => ({})) {
	return vi.fn(async (/** @type {any} */ url, /** @type {any} */ _init) => {
		const method = new URL(url).pathname.split('/').pop() ?? '';
		const { status = 200, body = { ok: true, result: true } } = respond(method);
		return new Response(JSON.stringify(body), { status });
	});
}
/** @param {ReturnType<typeof fakeFetch>} f */
const sent = (f) =>
	f.mock.calls.map(([url, init]) => ({
		method: new URL(url).pathname.split('/').pop(),
		body: JSON.parse(init.body)
	}));

const EDIT = { method: 'editMessageText', chat_id: 1, message_id: 9, text: 'x' };
const SEND = { method: 'sendMessage', chat_id: 1, text: 'x' };

describe('runPlan', () => {
	it('edita y después contesta el botón (sin «cargando»)', async () => {
		const f = fakeFetch();
		const r = await runPlan({ steps: [EDIT], callback: { id: 'cb' } }, telegramCaller(TOKEN, f));
		expect(r).toBe('ok');
		expect(sent(f)).toEqual([
			{ method: 'editMessageText', body: { chat_id: 1, message_id: 9, text: 'x' } },
			{ method: 'answerCallbackQuery', body: { callback_query_id: 'cb' } }
		]);
		expect(new URL(f.mock.calls[0][0]).pathname).toBe(`/bot${TOKEN}/editMessageText`);
	});

	it('429: «Más despacio 🙂», sin reintentar ni seguir', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const f = fakeFetch((m) =>
			m === 'editMessageText'
				? { status: 429, body: { ok: false, error_code: 429, parameters: { retry_after: 3 } } }
				: {}
		);
		const r = await runPlan(
			{ steps: [EDIT], fallback: [SEND], callback: { id: 'cb' } },
			telegramCaller(TOKEN, f)
		);
		expect(r).toBe('slow');
		expect(sent(f).map((c) => c.method)).toEqual(['editMessageText', 'answerCallbackQuery']);
		expect(sent(f)[1].body).toEqual({ callback_query_id: 'cb', text: SLOW_DOWN_TEXT });
		spy.mockRestore();
	});

	it('«message is not modified» no es un error', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const f = fakeFetch((m) =>
			m === 'editMessageText'
				? {
						status: 400,
						body: { ok: false, description: 'Bad Request: message is not modified: ...' }
					}
				: {}
		);
		const r = await runPlan(
			{ steps: [EDIT], fallback: [SEND], callback: { id: 'cb' } },
			telegramCaller(TOKEN, f)
		);
		expect(r).toBe('ok');
		expect(sent(f).map((c) => c.method)).toEqual(['editMessageText', 'answerCallbackQuery']);
		spy.mockRestore();
	});

	it('si la edición falla, prueba el fallback una vez', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const f = fakeFetch((m) =>
			m === 'editMessageText'
				? { status: 400, body: { ok: false, description: "Bad Request: message can't be edited" } }
				: {}
		);
		const r = await runPlan(
			{ steps: [EDIT], fallback: [SEND], callback: { id: 'cb' } },
			telegramCaller(TOKEN, f)
		);
		expect(r).toBe('ok');
		expect(sent(f).map((c) => c.method)).toEqual([
			'editMessageText',
			'sendMessage',
			'answerCallbackQuery'
		]);
		spy.mockRestore();
	});

	it('si todo falla en un grupo: el botón abre el privado (onFail), nunca con el token', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const f = fakeFetch((m) =>
			m === 'sendMessage'
				? { status: 400, body: { ok: false, description: `Bad Request ${TOKEN}` } }
				: {}
		);
		const link = 'https://t.me/BotDePrueba?start=semana';
		await runPlan(
			{ steps: [SEND], callback: { id: 'cb', onFail: { text: 'Abrí el bot', url: link } } },
			telegramCaller(TOKEN, f)
		);
		expect(sent(f)[1]).toEqual({
			method: 'answerCallbackQuery',
			body: { callback_query_id: 'cb', text: 'Abrí el bot', url: link }
		});
		expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
		spy.mockRestore();
	});

	it('un deleteMessage que falla no corta', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const f = fakeFetch((m) => (m === 'deleteMessage' ? { status: 400, body: { ok: false } } : {}));
		const r = await runPlan(
			{ steps: [{ method: 'deleteMessage', chat_id: 1, message_id: 9 }, SEND] },
			telegramCaller(TOKEN, f)
		);
		expect(r).toBe('ok');
		expect(sent(f).map((c) => c.method)).toEqual(['deleteMessage', 'sendMessage']);
		spy.mockRestore();
	});

	it('nada que hacer: no llama', async () => {
		const f = fakeFetch();
		expect(await runPlan(null, telegramCaller(TOKEN, f))).toBe('empty');
		expect(f).not.toHaveBeenCalled();
	});
});

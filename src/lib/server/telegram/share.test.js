/**
 * Compartir desde la Mini App (share.js): el `initData` se valida, solo un evento próximo del
 * índice público, la tarjeta del modo inline guardada con `savePreparedInlineMessage` para ese
 * usuario (enriquecida y, si Telegram la rechaza, la de siempre), el tope por persona, el evento
 * marcado por el link directo y los textos de «Textos del bot». Token, usuarios y eventos
 * inventados; nunca sale nada a la red.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { cleanBotTextOverrides } from '$lib/utils/botTexts.js';
import { makeInlineSource } from './inlineSource.js';
import { appStartParam, focusedSlug, miniAppShareTexts, prepareShare } from './share.js';

const TOKEN = '123456789:token-inventado-solo-para-pruebas';
const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const ORIGIN = 'https://kinkyvibe.ar';

/** Un `initData` firmado como lo firma Telegram. @param {number} userId @param {string} [token] */
function signed(userId, token = TOKEN) {
	const fields = {
		auth_date: String(Math.floor(NOW / 1000) - 30),
		user: JSON.stringify({ id: userId, first_name: 'Persona Inventada' })
	};
	const dcs = Object.keys(fields)
		.sort()
		.map((k) => `${k}=${fields[/** @type {keyof typeof fields} */ (k)]}`)
		.join('\n');
	const secret = createHmac('sha256', 'WebAppData').update(token).digest();
	const hash = createHmac('sha256', secret).update(dcs).digest('hex');
	return new URLSearchParams({ ...fields, hash }).toString();
}

/** @type {import('$lib/utils/search').SearchDoc[]} */
const DOCS = [
	{
		c: 'calendario',
		h: '/calendario/fiesta-inventada',
		t: 'Fiesta inventada',
		d: '2031-01-20T23:00:00.000Z',
		s: 'Resumen inventado.'
	},
	{
		c: 'calendario',
		h: '/calendario/fiesta-pasada',
		t: 'Fiesta pasada',
		d: '2030-12-20T23:00:00.000Z'
	},
	{ c: 'material', h: '/material/guia-inventada', t: 'Guía inventada', s: 'Resumen' }
];
const SOURCE = makeInlineSource(
	{ raw: { v: 1, docs: DOCS, tags: {} }, posts: [], wikiPosts: [], profiles: [] },
	{}
);

/**
 * @param {Partial<Parameters<typeof prepareShare>[0]>} more
 * @param {(method: string, body: any) => { ok: boolean, status: number, result?: unknown }} [answer]
 */
async function share(more = {}, answer = () => ({ ok: true, status: 200, result: { id: 'p-1' } })) {
	/** @type {any} */
	const call = vi.fn(async (/** @type {string} */ method, /** @type {any} */ body) =>
		answer(method, body)
	);
	const r = await prepareShare({
		initData: signed(4242),
		slug: 'fiesta-inventada',
		token: TOKEN,
		origin: ORIGIN,
		now: NOW,
		source: async () => SOURCE,
		call,
		...more
	});
	return { r, call };
}

describe('prepareShare', () => {
	it('guarda la tarjeta del evento para ese usuario y devuelve el id', async () => {
		const { r, call } = await share({ rich: true, botUsername: 'BotInventadoBot' });
		expect(r).toEqual({ status: 200, body: { id: 'p-1' } });
		expect(call).toHaveBeenCalledTimes(1);
		const [method, body] = call.mock.calls[0];
		expect(method).toBe('savePreparedInlineMessage');
		expect(body).toMatchObject({
			user_id: 4242,
			allow_user_chats: true,
			allow_group_chats: true,
			allow_channel_chats: true,
			result: { type: 'article', id: 'compartir', title: 'Fiesta inventada' }
		});
		expect(body.result.input_message_content.rich_message.html).toContain('Fiesta inventada');
		expect(JSON.stringify(body.result.reply_markup)).toContain(
			'https://t.me/BotInventadoBot?startapp=ev-fiesta-inventada'
		);
		// Nada del usuario de Telegram más allá de su id (ni el nombre).
		expect(JSON.stringify(body)).not.toContain('Persona Inventada');
	});

	it('si Telegram rechaza la enriquecida, prueba con la de siempre', async () => {
		const { r, call } = await share({ rich: true }, (_m, body) =>
			body.result.input_message_content.rich_message
				? { ok: false, status: 400 }
				: { ok: true, status: 200, result: { id: 'p-2' } }
		);
		expect(r).toEqual({ status: 200, body: { id: 'p-2' } });
		expect(call).toHaveBeenCalledTimes(2);
		expect(call.mock.calls[1][1].result.input_message_content).toHaveProperty('message_text');
	});

	it('sin rich, una sola vez y la de siempre; si falla, 502', async () => {
		const { r, call } = await share({}, () => ({ ok: false, status: 400 }));
		expect(r.status).toBe(502);
		expect(call).toHaveBeenCalledTimes(1);
		expect(call.mock.calls[0][1].result.input_message_content).toHaveProperty('message_text');
	});

	it('un initData roto, de otro bot o sin firma: 401, sin llamar a Telegram', async () => {
		for (const initData of ['', 'user=%7B%7D&hash=abc', signed(4242, '987:otro-token'), null]) {
			const { r, call } = await share({ initData });
			expect(r).toEqual({ status: 401, body: { error: 'bad_init_data' } });
			expect(call).not.toHaveBeenCalled();
		}
	});

	it('solo un evento próximo del índice público: lo demás, 404', async () => {
		for (const slug of ['fiesta-pasada', 'guia-inventada', 'evento-que-no-esta']) {
			const { r, call } = await share({ slug });
			expect(r, slug).toEqual({ status: 404, body: { error: 'not_found' } });
			expect(call).not.toHaveBeenCalled();
		}
		const { r } = await share({ slug: 'x'.repeat(500) });
		expect(r.status).toBe(400);
	});

	it('pasado el tope por persona: 429, sin leer nada', async () => {
		const source = vi.fn(async () => SOURCE);
		const { r, call } = await share({ allow: async () => false, source });
		expect(r).toEqual({ status: 429, body: { error: 'too_many' } });
		expect(source).not.toHaveBeenCalled();
		expect(call).not.toHaveBeenCalled();
	});
});

describe('el link directo y los textos', () => {
	const days = [{ day: 'lunes 20', events: [{ slug: 'fiesta-inventada' }, { slug: 'otra' }] }];

	it('marca el evento del link directo; lo que no es de un evento de la lista, nada', () => {
		expect(appStartParam('fiesta-inventada')).toBe('ev-fiesta-inventada');
		expect(focusedSlug(days, 'ev-fiesta-inventada')).toBe('fiesta-inventada');
		for (const p of ['ev-oculto', 'sigo', '', null, 'ev-' + 'x'.repeat(100)]) {
			expect(focusedSlug(days, p)).toBeNull();
		}
	});

	it('los textos: el original o lo cambiado en el panel', () => {
		expect(miniAppShareTexts()).toEqual({
			boton: '📤 Mandar a un chat',
			mandado: 'Listo, ya lo mandaste.',
			error: 'No se pudo mandar. Probá de nuevo en un rato.',
			destacado: '📌 Te pasaron este evento'
		});
		const texts = miniAppShareTexts(
			cleanBotTextOverrides({ 'compartir.miniapp_boton': 'Pasáselo a alguien' })
		);
		expect(texts.boton).toBe('Pasáselo a alguien');
	});
});

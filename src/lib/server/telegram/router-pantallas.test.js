/**
 * La navegación por pantallas de punta a punta (planUpdate): privado contra grupo, efímeros,
 * deep links, Buscar y la tarjeta con foto. Eventos inventados, sin red.
 */
import { describe, expect, it, vi } from 'vitest';
import { planUpdate } from './router.js';
import { SEARCH_PROMPT_TEXT } from './screens.js';

const ORIGIN = 'https://ejemplo.test';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');
const EVENTS = [
	{ slug: 'taller-inventado', title: 'Taller inventado', start: '2031-01-09T19:00:00-03:00' },
	{ slug: 'fiesta-inventada', title: 'Fiesta inventada', start: '2031-01-10T23:00:00-03:00' }
];
const CARD = {
	image: `${ORIGIN}/media/afiche.jpg`,
	place: 'Zona Inventada',
	ticket: {
		kind: /** @type {const} */ ('buy'),
		href: '/calendario/fiesta-inventada/entradas',
		text: 'Comprar entradas'
	}
};

/** @param {object} [over] */
const deps = (over = {}) => ({
	listUpcoming: vi.fn(async () => EVENTS),
	origin: ORIGIN,
	now: () => NOW,
	card: vi.fn(async () => CARD),
	fondo: vi.fn(async () => ({
		percent: 20,
		collected: 1000,
		goal: 2000,
		step: 10,
		updatedAt: null
	})),
	botUsername: 'BotDePrueba',
	...over
});

/**
 * @param {string} text
 * @param {object} [chat]
 * @param {object} [extra]
 */
const msg = (text, chat = { id: 42, type: 'private' }, extra = {}) => ({
	message: { chat, from: { id: 77, is_bot: false }, text, ...extra }
});

/**
 * @param {string} data
 * @param {object} [message]
 */
const tap = (data, message = { message_id: 9, chat: { id: 42, type: 'private' } }) => ({
	callback_query: { id: 'cb', from: { id: 77 }, data, message }
});

describe('privado', () => {
	it('/start: la pantalla de inicio', async () => {
		const p = await planUpdate(msg('/start'), deps());
		expect(p?.steps[0].method).toBe('sendMessage');
		expect(
			p?.steps[0].reply_markup.inline_keyboard[0].map((/** @type {any} */ b) => b.text)
		).toEqual(['Hoy', 'Semana', 'Finde']);
	});

	it('/semana y el botón «Semana» son la misma pantalla', async () => {
		const cmd = await planUpdate(msg('/semana'), deps());
		const btn = await planUpdate(tap('l:w:0'), deps());
		expect(btn?.steps[0].method).toBe('editMessageText');
		expect(btn?.steps[0].text).toBe(cmd?.steps[0].text);
		expect(btn?.steps[0].reply_markup).toEqual(cmd?.steps[0].reply_markup);
	});

	it('la tarjeta con token: foto con editMessageMedia y botón verde', async () => {
		const p = await planUpdate(tap('e:fiesta-inventada:w'), { ...deps(), media: true });
		expect(p?.steps[0]).toMatchObject({
			method: 'editMessageMedia',
			media: { type: 'photo', media: CARD.image }
		});
		expect(p?.steps[0].reply_markup.inline_keyboard[0][0]).toMatchObject({ style: 'success' });
	});

	it('sin token: la misma tarjeta como texto con vista previa grande', async () => {
		const p = await planUpdate(tap('e:fiesta-inventada:w'), deps());
		expect(p?.steps[0]).toMatchObject({
			method: 'editMessageText',
			link_preview_options: {
				url: `${ORIGIN}/calendario/fiesta-inventada`,
				prefer_large_media: true
			}
		});
	});

	it('volver de la foto a la lista: borra y manda la lista', async () => {
		const p = await planUpdate(
			tap('l:w:0', { message_id: 9, chat: { id: 42, type: 'private' }, photo: [{}] }),
			{ ...deps(), media: true }
		);
		expect(p?.steps.map((s) => s.method)).toEqual(['deleteMessage', 'sendMessage']);
	});

	it('un evento que ya no está: aviso, sin tocar el mensaje', async () => {
		const p = await planUpdate(tap('e:ya-paso:w'), deps());
		expect(p).toEqual({
			steps: [],
			callback: { id: 'cb', text: 'Ese evento ya no está disponible.' }
		});
	});

	it('el contador «1/3» no hace nada', async () => {
		expect(await planUpdate(tap('x'), deps())).toEqual({ steps: [], callback: { id: 'cb' } });
	});

	it('deep links: ?start=semana, ?start=ev-<id>', async () => {
		const semana = await planUpdate(msg('/start semana'), deps());
		expect(semana?.steps[0].text).toContain('En los próximos 7 días');
		const ev = await planUpdate(msg('/start ev-fiesta-inventada'), deps());
		expect(ev?.steps[0].text).toContain('<b>Fiesta inventada</b>');
		const gone = await planUpdate(msg('/start ev-ya-paso'), deps());
		expect(gone?.steps[0].text).toBe('Ese evento ya no está disponible.');
	});

	it('Buscar: mensaje nuevo con force_reply; la respuesta trae los resultados', async () => {
		const prompt = await planUpdate(tap('s'), deps());
		expect(prompt?.steps[0]).toMatchObject({
			method: 'sendMessage',
			text: SEARCH_PROMPT_TEXT,
			reply_markup: { force_reply: true }
		});
		const answer = await planUpdate(
			msg('fiesta', undefined, {
				reply_to_message: { from: { id: 1, is_bot: true }, text: SEARCH_PROMPT_TEXT }
			}),
			deps()
		);
		expect(answer?.steps[0].text).toContain('Fiesta inventada');
		expect(answer?.steps[0].reply_markup.inline_keyboard[0][0].callback_data).toBe(
			'e:fiesta-inventada:n'
		);
	});

	it('«Cancelar» borra el mensaje de Buscar', async () => {
		const p = await planUpdate(tap('sx'), deps());
		expect(p?.steps).toEqual([{ method: 'deleteMessage', chat_id: 42, message_id: 9 }]);
	});

	it('un texto cualquiera (sin responder a Buscar) no se contesta', async () => {
		expect(await planUpdate(msg('hola'), deps())).toBeNull();
	});

	it('/fondo usa solo lo que da deps.fondo', async () => {
		const d = deps();
		const p = await planUpdate(msg('/fondo'), d);
		expect(d.fondo).toHaveBeenCalledTimes(1);
		expect(p?.steps[0].text).toContain('50 % de la meta');
	});
});

describe('grupos', () => {
	const GROUP = { id: -100, type: 'supergroup' };

	it('comando efímero: respuesta efímera para quien preguntó', async () => {
		const p = await planUpdate(msg('/semana', GROUP, { ephemeral_message_id: 3 }), {
			...deps(),
			media: true
		});
		expect(p?.steps[0]).toMatchObject({
			method: 'sendMessage',
			chat_id: -100,
			ephemeral_message_parameters: { receiver_user_id: 77 },
			reply_parameters: { ephemeral_message_id: 3 }
		});
	});

	it('comando común: una respuesta pública', async () => {
		const p = await planUpdate(msg('/semana', GROUP), deps());
		expect(p?.steps).toHaveLength(1);
		expect(p?.steps[0]).not.toHaveProperty('ephemeral_message_parameters');
	});

	it('la tarjeta en un grupo: sin foto, aunque haya token', async () => {
		const p = await planUpdate(
			tap('e:fiesta-inventada:w', { message_id: 0, ephemeral_message_id: 3, chat: GROUP }),
			{ ...deps(), media: true }
		);
		expect(p?.steps[0].method).toBe('editEphemeralMessageText');
		expect(p?.steps[0].receiver_user_id).toBe(77);
	});

	it('un botón de la respuesta pública: solo cambia la vista de quien tocó', async () => {
		const p = await planUpdate(tap('l:f:0', { message_id: 12, chat: GROUP }), {
			...deps(),
			media: true
		});
		expect(p?.steps[0]).toMatchObject({
			method: 'sendMessage',
			ephemeral_message_parameters: {
				receiver_user_id: 77,
				callback_query_id: 'cb',
				replace_callback_query_message: true
			}
		});
		expect(p?.callback?.onFail?.url).toBe('https://t.me/BotDePrueba?start=finde');
	});

	it('Buscar en un grupo no abre force_reply', async () => {
		const p = await planUpdate(msg('/buscar', GROUP), deps());
		expect(JSON.stringify(p)).not.toContain('force_reply');
		expect(p?.steps[0].text).toContain('/evento');
	});

	it('las respuestas a Buscar en un grupo no se contestan', async () => {
		const p = await planUpdate(
			msg('fiesta', GROUP, {
				reply_to_message: { from: { id: 1, is_bot: true }, text: SEARCH_PROMPT_TEXT }
			}),
			deps()
		);
		expect(p).toBeNull();
	});
});

/**
 * El modo inline con mensajes enriquecidos (`telegram_enriquecido`, rich.js): con `rich`, lo que
 * se manda es un `InputRichMessageContent`; sin `rich`, la tarjeta de siempre, igual que antes; si
 * Telegram rechaza la respuesta enriquecida, la misma con las tarjetas de siempre; y el botón
 * «📅 Abrir en el calendario» (el link directo a la Mini App en ese evento). Datos inventados.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { inlineArticle, miniAppEventLink, planInlineQuery, resetInlineRate } from './inline.js';
import { makeInlineSource } from './inlineSource.js';

const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const PROD = 'https://kinkyvibe.ar';
const BOT = 'BotInventadoBot';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */

/** @type {SearchDoc} */
const WIKI = {
	c: 'wiki',
	h: '/wiki/cuerdas-inventadas',
	t: 'Cuerdas inventadas',
	i: '🪢',
	s: 'Una definición inventada.',
	b: 'Un texto inventado para la prueba.'
};
/** @type {SearchDoc} */
const EVENT = {
	c: 'calendario',
	h: '/calendario/fiesta-inventada',
	t: 'Fiesta inventada',
	d: '2031-01-20T23:00:00.000Z',
	s: 'Resumen inventado.'
};
/** @type {SearchDoc} */
const PERSON = { c: 'amigues', h: '/amigues/persona-inventada', t: 'Persona inventada' };

const source = makeInlineSource(
	{ raw: { v: 1, docs: [WIKI, EVENT, PERSON], tags: {} }, posts: [], wikiPosts: [], profiles: [] },
	{}
);

beforeEach(() => resetInlineRate());

describe('miniAppEventLink', () => {
	it('el link directo a la Main Mini App, con el mismo id que los deep links del bot', () => {
		expect(miniAppEventLink(BOT, 'fiesta-inventada')).toBe(
			`https://t.me/${BOT}?startapp=ev-fiesta-inventada`
		);
		// Una dirección rara va con su hash (solo A-Za-z0-9_-).
		expect(miniAppEventLink(BOT, 'fiesta con espacios')).toMatch(
			/^https:\/\/t\.me\/BotInventadoBot\?startapp=ev-_[a-z0-9]+$/
		);
		expect(miniAppEventLink(null, 'fiesta-inventada')).toBeNull();
	});
});

describe('inlineArticle con rich', () => {
	it('la Kinkipedia: se manda enriquecida, con el mismo «Ver en el sitio»', () => {
		const plain = inlineArticle('0', WIKI, undefined, undefined, { origin: PROD, now: NOW });
		const rich = inlineArticle('0', WIKI, undefined, undefined, {
			origin: PROD,
			now: NOW,
			rich: true
		});
		expect(plain.input_message_content).toHaveProperty('message_text');
		expect(rich.input_message_content).toEqual({
			rich_message: {
				html: expect.stringContaining('<h3>🪢 Cuerdas inventadas</h3>')
			}
		});
		// Sin imágenes por URL (en el modo inline Telegram solo acepta archivos ya subidos).
		expect(JSON.stringify(rich.input_message_content)).not.toContain('<img');
		expect(rich.reply_markup).toEqual(plain.reply_markup);
		expect(rich.title).toBe(plain.title);
		expect(rich.description).toBe(plain.description);
	});

	it('amigues sigue con la tarjeta de siempre', () => {
		const a = inlineArticle('0', PERSON, undefined, undefined, {
			origin: PROD,
			now: NOW,
			rich: true
		});
		expect(a.input_message_content).toHaveProperty('message_text');
	});

	it('un evento con el usuario del bot: «📅 Abrir en el calendario»; sin https, nada', () => {
		const a = inlineArticle('0', EVENT, undefined, undefined, {
			origin: PROD,
			now: NOW,
			rich: true,
			botUsername: BOT
		});
		expect(a.reply_markup?.inline_keyboard.at(-1)).toEqual([
			{
				text: '📅 Abrir en el calendario',
				url: `https://t.me/${BOT}?startapp=ev-fiesta-inventada`
			}
		]);
		const local = inlineArticle('0', EVENT, undefined, undefined, {
			origin: 'http://localhost:5173',
			now: NOW,
			botUsername: BOT
		});
		expect(JSON.stringify(local)).not.toContain('startapp');
		// Sin el usuario del bot (el interruptor apagado), tampoco.
		const off = inlineArticle('0', EVENT, undefined, undefined, { origin: PROD, now: NOW });
		expect(JSON.stringify(off)).not.toContain('startapp');
	});
});

describe('planInlineQuery con rich', () => {
	/** @param {Record<string, unknown>} more */
	const ask = (more) =>
		planInlineQuery(
			{ id: 'iq', from: { id: 7 }, query: '', offset: '' },
			{ source: async () => source, origin: PROD, now: () => NOW, ...more }
		);

	it('sin rich, como siempre: un solo paso, sin vuelta atrás', async () => {
		const plan = await ask({});
		expect(plan?.fallback).toBeUndefined();
		expect(JSON.stringify(plan)).not.toContain('rich_message');
	});

	it('con rich: la respuesta enriquecida y, si Telegram la rechaza, la de siempre', async () => {
		const plan = await ask({ rich: true, botUsername: BOT });
		const [rich] = /** @type {any[]} */ (plan?.steps ?? []);
		const [plain] = /** @type {any[]} */ (plan?.fallback ?? []);
		expect(rich.method).toBe('answerInlineQuery');
		expect(plain.method).toBe('answerInlineQuery');
		expect(rich.results.map((/** @type {any} */ r) => r.id)).toEqual(
			plain.results.map((/** @type {any} */ r) => r.id)
		);
		expect(JSON.stringify(rich)).toContain('rich_message');
		expect(JSON.stringify(plain)).not.toContain('rich_message');
		// El botón del calendario va en las dos (no depende de los mensajes enriquecidos).
		expect(JSON.stringify(plain)).toContain('startapp=ev-fiesta-inventada');
	});
});

/**
 * Buscar en todo el sitio desde el chat (`/buscar <texto>` y la respuesta a «🔎 Buscar»): la lista
 * marcada por tipo, las páginas, la tarjeta compacta (material, Kinkipedia, amigues), la tarjeta de
 * siempre para un evento próximo (con «‹ Volver»), y que `/evento` sigue siendo solo de eventos.
 * Índice inventado, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { planUpdate } from './router.js';
import { clipQuery, decodeNav, encodeNav, SEARCH_QUERY_BYTES, byteLength } from './nav.js';
import { SEARCH_PROMPT_HEAD } from './screens.js';
import { docHash, TYPE_EMOJI } from './siteScreens.js';
import { CARD_IMAGE_OPTIONS, inlineThumbUrl, resetInlineRate } from './inline.js';
import { renderBotText } from '$lib/utils/botTexts.js';
import { makeInlineSource } from './inlineSource.js';
import { UNAVAILABLE_TEXT } from './format.js';

const ORIGIN = 'https://kinkyvibe.ar';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');
const IMG = `/media/img/${'b'.repeat(64)}.webp`;

const EVENTS = [
	{ slug: 'taller-cuerdas', title: 'Taller de cuerdas', start: '2031-01-09T19:00:00-03:00' }
];

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */
/** @type {SearchDoc[]} */
const DOCS = [
	{
		c: 'calendario',
		h: '/calendario/taller-cuerdas',
		t: 'Taller de cuerdas',
		d: '2031-01-09T22:00:00.000Z'
	},
	{
		c: 'calendario',
		h: '/calendario/cuerdas-pasado',
		t: 'Cuerdas del año pasado',
		d: '2030-01-09T22:00:00.000Z'
	},
	{
		c: 'material',
		h: '/material/guia-cuerdas',
		t: 'Guía de cuerdas',
		s: 'Cómo atar sin <apuro> & con cuidado'
	},
	{ c: 'wiki', h: '/wiki/cuerdas', t: 'Cuerdas', s: 'Atar con cuerdas', i: '🪢' },
	{ c: 'amigues', h: '/amigues/persona-cuerdas', t: 'Persona de cuerdas', s: 'Da talleres' },
	{ c: 'serie', h: '/wiki/noche-de-cuerdas', t: 'Noche de cuerdas' }
];

const source = makeInlineSource(
	{
		raw: { v: 1, docs: DOCS, tags: {} },
		posts: [
			/** @type {any} */ ({
				path: '/material/guia-cuerdas',
				meta: { category: 'material', featured: IMG }
			})
		],
		wikiPosts: [],
		profiles: [
			{
				object: {
					id: 3,
					slug: 'persona-cuerdas',
					title: 'Persona de cuerdas',
					data: { kind: 'proyecto' }
				},
				legacySlug: null
			}
		]
	},
	{}
);

/** @param {object} [over] */
const deps = (over = {}) => ({
	listUpcoming: vi.fn(async () => EVENTS),
	origin: ORIGIN,
	now: () => NOW,
	card: vi.fn(async () => ({})),
	botUsername: 'BotDePrueba',
	inline: { source: vi.fn(async () => source) },
	...over
});

/** @param {string} text @param {object} [chat] @param {object} [extra] */
const msg = (text, chat = { id: 42, type: 'private' }, extra = {}) => ({
	message: { chat, from: { id: 77, is_bot: false }, text, ...extra }
});

/** La respuesta al mensaje de Buscar. @param {string} text */
const reply = (text) =>
	msg(text, undefined, {
		reply_to_message: { from: { is_bot: true }, text: `${SEARCH_PROMPT_HEAD}: …` }
	});

/** @param {string} data */
const tap = (data) => ({
	callback_query: {
		id: 'cb',
		from: { id: 77 },
		data,
		message: { message_id: 9, chat: { id: 42, type: 'private' } }
	}
});

/** @param {any} step */
const buttons = (step) => step.reply_markup.inline_keyboard.flat();

beforeEach(() => resetInlineRate());

describe('la lista de resultados', () => {
	it('la respuesta a Buscar busca en todo el sitio, marcado por tipo, en el orden del sitio', async () => {
		const p = await planUpdate(reply('cuerdas'), deps());
		const step = /** @type {any} */ (p?.steps[0]);
		expect(step.method).toBe('sendMessage');
		expect(step.text).toContain(
			renderBotText('sitio.encontre', { cantidad: DOCS.length, busqueda: 'cuerdas' })
		);
		// Próximos, series, material, amigues, Kinkipedia, pasados (groupHits); de a 5.
		const rows = buttons(step).filter((/** @type {any} */ b) => b.callback_data?.startsWith('r:'));
		expect(rows.map((/** @type {any} */ b) => b.text)).toEqual([
			`${TYPE_EMOJI.calendario} Taller de cuerdas`,
			`${TYPE_EMOJI.serie} Noche de cuerdas`,
			`${TYPE_EMOJI.material} Guía de cuerdas`,
			`${TYPE_EMOJI.amigues} Persona de cuerdas`,
			`${TYPE_EMOJI.wiki} Cuerdas`
		]);
		for (const emoji of ['📅', '📚', '📖', '👥']) expect(step.text).toContain(emoji);
		// El HTML del resumen, escapado.
		expect(step.text).toContain('Cómo atar sin &lt;apuro&gt; &amp; con cuidado');
		const texts = buttons(step).map((/** @type {any} */ b) => b.text);
		expect(texts).toEqual(
			expect.arrayContaining([
				'1/2',
				'›',
				renderBotText('eventos.boton_buscar_otra'),
				renderBotText('inicio.boton_inicio')
			])
		);
	});

	it('páginas: «›» lleva lo buscado y la página; la última tiene el que faltaba', async () => {
		const first = /** @type {any} */ ((await planUpdate(reply('cuerdas'), deps()))?.steps[0]);
		const next = buttons(first).find((/** @type {any} */ b) => b.text === '›');
		expect(next.callback_data).toBe('q:1:cuerdas');
		const second = /** @type {any} */ (
			(await planUpdate(tap(next.callback_data), deps()))?.steps[0]
		);
		expect(second.method).toBe('editMessageText');
		expect(second.text).toContain('2/2');
		expect(second.text).toContain('Cuerdas del año pasado');
		expect(buttons(second).map((/** @type {any} */ b) => b.text)).toContain('‹');
	});

	it('/buscar <texto> da los mismos resultados, también en un grupo', async () => {
		const fromReply = /** @type {any} */ ((await planUpdate(reply('cuerdas'), deps()))?.steps[0]);
		const cmd = /** @type {any} */ ((await planUpdate(msg('/buscar cuerdas'), deps()))?.steps[0]);
		expect(cmd.text).toBe(fromReply.text);
		const group = await planUpdate(msg('/buscar cuerdas', { id: -5, type: 'supergroup' }), deps());
		expect(JSON.stringify(group)).toContain('Guía de cuerdas');
		// Sin texto en un grupo: cómo buscar.
		const hint = await planUpdate(msg('/buscar', { id: -5, type: 'supergroup' }), deps());
		expect(JSON.stringify(hint)).toContain('/buscar cuerdas');
	});

	it('nada encontrado: lo dice, muestra lo que viene y ofrece buscar otra cosa', async () => {
		// Lo demás que ofrece (parecidos, sección, «Seguir»): router-sin-resultados.test.js.
		const step = /** @type {any} */ ((await planUpdate(reply('zzzzzz'), deps()))?.steps[0]);
		expect(
			step.text.startsWith(renderBotText('sitio.sin_resultados', { busqueda: 'zzzzzz' }))
		).toBe(true);
		expect(step.text).toContain(renderBotText('sitio.proximos'));
		expect(step.text).toContain('Taller de cuerdas');
		expect(step.reply_markup.inline_keyboard.at(-1)).toEqual([
			{ text: renderBotText('eventos.boton_buscar_otra'), callback_data: 's' },
			{ text: renderBotText('inicio.boton_inicio'), callback_data: 'h' }
		]);
	});

	it('/evento sigue siendo solo de eventos próximos', async () => {
		const p = await planUpdate(msg('/evento cuerdas'), deps());
		const json = JSON.stringify(p);
		expect(json).toContain('Taller de cuerdas');
		expect(json).not.toContain('Guía de cuerdas');
		expect(json).not.toContain('Persona de cuerdas');
	});
});

describe('las tarjetas', () => {
	/** @param {string} href @param {number} [page] */
	const docTap = (href, page = 0) => {
		const doc = /** @type {SearchDoc} */ (DOCS.find((d) => d.h === href));
		return tap(encodeNav({ screen: 'site_doc', hash: docHash(doc), page, query: 'cuerdas' }));
	};

	it('material: tarjeta compacta con foto achicada, «Ver en el sitio», «‹ Volver» e «🏠 Inicio»', async () => {
		const p = await planUpdate(docTap('/material/guia-cuerdas', 1), { ...deps(), media: true });
		const step = /** @type {any} */ (p?.steps[0]);
		expect(step.method).toBe('editMessageMedia');
		expect(step.media.media).toBe(inlineThumbUrl(IMG, ORIGIN, CARD_IMAGE_OPTIONS));
		expect(step.media.media).not.toBe(`${ORIGIN}${IMG}`);
		expect(step.media.caption).toContain('<b>📚 Guía de cuerdas</b>');
		expect(step.media.caption).toContain('Cómo atar sin &lt;apuro&gt;');
		expect(step.reply_markup.inline_keyboard).toEqual([
			[{ text: renderBotText('sitio.boton_ver'), url: `${ORIGIN}/material/guia-cuerdas` }],
			[
				{ text: renderBotText('inicio.boton_volver'), callback_data: 'q:1:cuerdas' },
				{ text: renderBotText('inicio.boton_inicio'), callback_data: 'h' }
			]
		]);
	});

	it('amigues y Kinkipedia: el tipo de perfil o el resumen, sin foto si no hay', async () => {
		const person = /** @type {any} */ (
			(await planUpdate(docTap('/amigues/persona-cuerdas'), deps()))?.steps[0]
		);
		expect(person.method).toBe('editMessageText');
		expect(person.text).toContain('<b>👥 Persona de cuerdas</b>\nProyecto · Da talleres');
		const wiki = /** @type {any} */ ((await planUpdate(docTap('/wiki/cuerdas'), deps()))?.steps[0]);
		expect(wiki.text).toContain('<b>📖 🪢 Cuerdas</b>\nAtar con cuerdas');
	});

	it('un evento próximo: la tarjeta de siempre, con «‹ Volver» a los resultados', async () => {
		const d = deps();
		const step = /** @type {any} */ (
			(await planUpdate(docTap('/calendario/taller-cuerdas'), d))?.steps[0]
		);
		expect(step.text).toContain('Ver todo en el sitio');
		expect(d.card).toHaveBeenCalled();
		expect(step.reply_markup.inline_keyboard.at(-1)).toEqual([
			{ text: renderBotText('inicio.boton_volver'), callback_data: 'q:0:cuerdas' },
			{ text: renderBotText('inicio.boton_inicio'), callback_data: 'h' }
		]);
	});

	it('un evento que ya pasó: la tarjeta compacta con la fecha', async () => {
		const step = /** @type {any} */ (
			(await planUpdate(docTap('/calendario/cuerdas-pasado'), deps()))?.steps[0]
		);
		expect(step.text).toContain('<b>📅 Cuerdas del año pasado</b>');
		expect(step.text).toContain('<tg-time');
	});

	it('algo que ya no está entre los resultados: avisa y no cambia el mensaje', async () => {
		const p = await planUpdate(tap('r:zzzz:0:cuerdas'), deps());
		expect(p?.steps).toEqual([]);
		expect(p?.callback?.text).toBe(UNAVAILABLE_TEXT);
	});
});

describe('el callback_data de la búsqueda', () => {
	it('ida y vuelta, siempre dentro de los 64 bytes', () => {
		const long = 'ñandú '.repeat(30);
		const q = clipQuery(long);
		expect(byteLength(q)).toBeLessThanOrEqual(SEARCH_QUERY_BYTES);
		for (const state of [
			{ screen: /** @type {const} */ ('site_results'), query: q, page: 12 },
			{ screen: /** @type {const} */ ('site_doc'), hash: 'abc1234', page: 3, query: q },
			{ screen: /** @type {const} */ ('site_doc'), hash: 'abc1234', page: 0, query: 'a: b' }
		]) {
			const data = encodeNav(state);
			expect(byteLength(data)).toBeLessThanOrEqual(64);
			expect(decodeNav(data)).toEqual(state);
		}
		// Lo que no armamos nosotres no se lee.
		expect(decodeNav('q:1:')).toBeNull();
		expect(decodeNav('q:x:cuerdas')).toBeNull();
		expect(decodeNav('r:NO:0:cuerdas')).toBeNull();
		expect(decodeNav(`q:0:${'a'.repeat(50)}`)).toBeNull();
	});
});

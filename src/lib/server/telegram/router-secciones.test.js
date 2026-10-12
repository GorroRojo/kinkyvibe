/**
 * Recorrer el sitio por secciones (sections.js): los botones del inicio, la lista de cada sección
 * (solo su tipo, en el orden del sitio), las páginas, el filtro por etiqueta (y sacarlo), la
 * tarjeta compacta con «‹ Volver» a la página de la que vino, el largo del `callback_data`, los
 * botones armados a mano y el interruptor. Índice inventado, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBotText } from '$lib/utils/botTexts.js';
import { planUpdate } from './router.js';
import { byteLength, CALLBACK_MAX_BYTES, decodeNav, encodeNav, shortHash } from './nav.js';
import { docHash } from './siteScreens.js';
import { resetInlineRate } from './inline.js';
import { makeInlineSource } from './inlineSource.js';
import { SECTION_TAGS_MAX } from './sections.js';
import { handleWebhook } from './webhook.js';

const ORIGIN = 'https://kinkyvibe.ar';
const NOW = Date.parse('2031-01-08T12:00:00-03:00');

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */

/** 12 materiales (el 0 es el más viejo): tres páginas. Los pares tienen «cuerdas». */
const MATERIAL = Array.from({ length: 12 }, (_, i) => ({
	doc: /** @type {SearchDoc} */ ({
		c: 'material',
		h: `/material/material-${i}`,
		t: `Material ${String(i).padStart(2, '0')}`,
		s: `Resumen ${i}`,
		g: i % 2 === 0 ? ['cuerdas', 'cuidados'] : ['cuidados']
	}),
	date: `2030-01-${String(i + 1).padStart(2, '0')}`
}));

/** Una etiqueta con un nombre larguísimo, en muchos materiales: el botón igual entra. */
const LONG_TAG = 'etiqueta-con-un-nombre-larguisimo-para-ver-que-el-boton-entra-igual';

/** @type {SearchDoc[]} */
const DOCS = [
	...MATERIAL.map((m) => m.doc),
	{ c: 'wiki', h: '/wiki/zapatos', t: 'Zapatos', s: 'Fetiche de zapatos', g: ['zapatos'] },
	{ c: 'wiki', h: '/wiki/atadura', t: 'Atadura', g: ['cuerdas'] },
	{ c: 'wiki', h: '/wiki/cuerdas', t: 'Cuerdas', i: '🪢', g: ['cuerdas'] },
	{ c: 'amigues', h: '/amigues/zoe', t: 'Zoe Inventade', s: 'Da talleres', g: ['cuerdas'] },
	{ c: 'amigues', h: '/amigues/ana', t: 'Ana Inventada', g: ['cuerdas'] },
	// Un lugar no listado al que lleva un evento: sale buscando, nunca en la lista de Amigues.
	{ c: 'amigues', h: '/amigues/lugar-no-listado', t: 'Lugar No Listado Inventado' },
	{ c: 'serie', h: '/wiki/noche-b', t: 'Noche B', i: '🌙', g: ['noche-b'] },
	{ c: 'serie', h: '/wiki/noche-a', t: 'Noche A', g: ['noche-a'] },
	{ c: 'calendario', h: '/calendario/evento', t: 'Evento Inventado', d: '2031-01-09T22:00:00.000Z' }
];

const source = makeInlineSource(
	{
		raw: {
			v: 1,
			docs: DOCS,
			tags: { cuerdas: ['Cuerdas'], cuidados: ['Cuidados'], zapatos: ['Zapatos'] }
		},
		posts: MATERIAL.map(
			(m) =>
				/** @type {any} */ ({
					path: m.doc.h,
					meta: { category: 'material', published_date: m.date }
				})
		),
		wikiPosts: [],
		profiles: [
			{ object: { id: 1, slug: 'zoe', title: 'Zoe Inventade', data: {} }, legacySlug: null },
			{ object: { id: 2, slug: 'ana', title: 'Ana Inventada', data: {} }, legacySlug: null },
			{
				object: {
					id: 3,
					slug: 'lugar-no-listado',
					title: 'Lugar No Listado Inventado',
					data: { kind: 'lugar', unlisted: true }
				},
				legacySlug: null
			}
		]
	},
	{}
);

/** @param {object} [over] */
const deps = (over = {}) => ({
	listUpcoming: vi.fn(async () => []),
	origin: ORIGIN,
	now: () => NOW,
	card: vi.fn(async () => ({})),
	botUsername: 'BotDePrueba',
	inline: { source: vi.fn(async () => source) },
	...over
});

/** @param {string} data @param {object} [chat] */
const tap = (data, chat = { id: 42, type: 'private' }) => ({
	callback_query: { id: 'cb', from: { id: 77 }, data, message: { message_id: 9, chat } }
});

/** @param {string} data @param {any} [d] */
async function screen(data, d = deps()) {
	const plan = await planUpdate(tap(data), d);
	return /** @type {any} */ (plan);
}

/** @param {any} plan */
const step = (plan) => plan.steps[0];
/** @param {any} plan @returns {any[]} */
const buttons = (plan) => step(plan).reply_markup.inline_keyboard.flat();
/** @param {any} plan @param {string} prefix */
const itemTitles = (plan, prefix) =>
	buttons(plan)
		.filter((b) => b.callback_data?.startsWith(prefix))
		.map((b) => b.text);
/** @param {any} plan @param {string} text */
const button = (plan, text) => buttons(plan).find((b) => b.text === text);

const T = renderBotText;

beforeEach(() => resetInlineRate());

describe('el inicio', () => {
	it('con el índice público, suma Material, Kinkipedia, Amigues y Series', async () => {
		const home = await screen('h');
		const texts = buttons(home).map((b) => b.text);
		for (const [key, data] of [
			['secciones.boton_material', 'c:m:0'],
			['secciones.boton_kinkipedia', 'c:w:0'],
			['secciones.boton_amigues', 'c:a:0'],
			['secciones.boton_series', 'c:s:0']
		]) {
			expect(texts).toContain(T(key));
			expect(button(home, T(key)).callback_data).toBe(data);
		}
		expect(texts).toEqual(
			expect.arrayContaining(['📚 Material', '📖 Kinkipedia', '👥 Amigues', '🔁 Series'])
		);
	});

	it('sin el índice (sin `inline`), el inicio de siempre', async () => {
		const home = await screen('h', deps({ inline: null }));
		expect(buttons(home).some((b) => b.callback_data?.startsWith('c:'))).toBe(false);
	});

	it('/start también las muestra', async () => {
		const plan = /** @type {any} */ (
			await planUpdate(
				{ message: { chat: { id: 42, type: 'private' }, from: { id: 77 }, text: '/start' } },
				deps()
			)
		);
		expect(JSON.stringify(plan)).toContain('"c:m:0"');
	});
});

describe('cada sección: solo lo suyo, en el orden del sitio', () => {
	it('Material: del más nuevo, de a 5', async () => {
		const plan = await screen('c:m:0');
		expect(step(plan).text).toContain('<b>📚 Material</b> · 1/3');
		expect(itemTitles(plan, 'cd:m:')).toEqual([
			'📚 Material 11',
			'📚 Material 10',
			'📚 Material 09',
			'📚 Material 08',
			'📚 Material 07'
		]);
		expect(step(plan).text).toContain('Resumen 11');
		expect(step(plan).text).not.toContain('Zapatos');
	});

	it('Kinkipedia: por nombre, solo las entradas (las series van aparte)', async () => {
		const plan = await screen('c:w:0');
		expect(step(plan).text).toContain('<b>📖 Kinkipedia</b>');
		expect(itemTitles(plan, 'cd:w:')).toEqual(['📖 Atadura', '📖 Cuerdas', '📖 Zapatos']);
		expect(step(plan).text).not.toContain('Noche');
		// Sin páginas: no hay «‹ 1/1 ›».
		expect(buttons(plan).some((b) => b.text === '1/1')).toBe(false);
	});

	it('Amigues: por nombre, sin el lugar no listado', async () => {
		const plan = await screen('c:a:0');
		expect(itemTitles(plan, 'cd:a:')).toEqual(['👥 Ana Inventada', '👥 Zoe Inventade']);
		expect(JSON.stringify(plan)).not.toContain('No Listado');
		expect(JSON.stringify(plan)).not.toContain('/amigues/lugar-no-listado');
	});

	it('Series: por nombre', async () => {
		const plan = await screen('c:s:0');
		expect(step(plan).text).toContain('<b>🔁 Series</b>');
		expect(itemTitles(plan, 'cd:s:')).toEqual(['📖 Noche A', '📖 Noche B']);
	});

	it('ningún evento en ninguna sección', async () => {
		for (const s of ['m', 'w', 'a', 's']) {
			for (const page of [0, 1, 2]) {
				expect(JSON.stringify(await screen(`c:${s}:${page}`))).not.toContain('Evento Inventado');
			}
		}
	});
});

describe('páginas', () => {
	it('«‹ 2/3 ›»: el del medio deshabilitado; las flechas llevan la sección y la página', async () => {
		const first = await screen('c:m:0');
		expect(button(first, '›').callback_data).toBe('c:m:1');
		expect(button(first, '‹')).toBeUndefined();
		const second = await screen(button(first, '›').callback_data);
		expect(step(second).method).toBe('editMessageText');
		expect(step(second).text).toContain('2/3');
		expect(button(second, '2/3')).toEqual({ text: '2/3', disabled: {} });
		expect(button(second, '‹').callback_data).toBe('c:m:0');
		expect(button(second, '›').callback_data).toBe('c:m:2');
		const last = await screen('c:m:2');
		expect(itemTitles(last, 'cd:m:')).toEqual(['📚 Material 01', '📚 Material 00']);
		expect(button(last, '›')).toBeUndefined();
	});

	it('una página de más va a la última', async () => {
		const plan = await screen('c:m:99');
		expect(step(plan).text).toContain('3/3');
	});
});

describe('filtrar por etiqueta', () => {
	it('«🏷 Filtrar por etiqueta» muestra las más usadas, con cuántas', async () => {
		const list = await screen('c:m:0');
		const filter = button(list, T('secciones.boton_filtrar'));
		expect(filter.callback_data).toBe('ct:m');
		const tags = await screen(filter.callback_data);
		expect(step(tags).text).toContain(T('secciones.elegir_etiqueta'));
		const tagButtons = buttons(tags).filter((b) => /^c:m:0:/.test(b.callback_data ?? ''));
		expect(tagButtons.map((b) => b.text)).toEqual(['Cuidados · 12', 'Cuerdas · 6']);
		expect(tagButtons[1].callback_data).toBe(`c:m:0:${shortHash('cuerdas')}`);
		// Sin una elegida, no hay «Sin filtro»: «‹ Volver» a la lista.
		expect(button(tags, T('secciones.boton_sin_filtro'))).toBeUndefined();
		expect(button(tags, T('inicio.boton_volver')).callback_data).toBe('c:m:0');
	});

	it('con una etiqueta: solo lo que la tiene, las páginas la mantienen y se puede sacar', async () => {
		const tag = shortHash('cuerdas');
		const plan = await screen(`c:m:0:${tag}`);
		expect(step(plan).text).toContain('<b>📚 Material</b> · 🏷 Cuerdas · 1/2');
		expect(itemTitles(plan, 'cd:m:')).toEqual([
			'📚 Material 10',
			'📚 Material 08',
			'📚 Material 06',
			'📚 Material 04',
			'📚 Material 02'
		]);
		expect(button(plan, '›').callback_data).toBe(`c:m:1:${tag}`);
		expect(button(plan, T('secciones.boton_filtrar')).callback_data).toBe(`ct:m:${tag}`);
		expect(button(plan, T('secciones.boton_sin_filtro')).callback_data).toBe('c:m:0');
		// En las etiquetas, la elegida marcada, «Sin filtro» y «Volver» a la lista filtrada.
		const tags = await screen(`ct:m:${tag}`);
		expect(buttons(tags).map((b) => b.text)).toContain('✓ Cuerdas · 6');
		expect(button(tags, T('secciones.boton_sin_filtro')).callback_data).toBe('c:m:0');
		expect(button(tags, T('inicio.boton_volver')).callback_data).toBe(`c:m:0:${tag}`);
	});

	it('una sección sin etiquetas para ofrecer no muestra el botón', async () => {
		const series = await screen('c:s:0');
		expect(button(series, T('secciones.boton_filtrar'))).toBeUndefined();
		const tags = await screen('ct:s');
		expect(step(tags).text).toContain(T('secciones.sin_etiquetas'));
	});

	it('hasta SECTION_TAGS_MAX etiquetas, de dos por fila', async () => {
		const many = makeInlineSource(
			{
				raw: {
					v: 1,
					docs: Array.from({ length: 4 }, (_, i) => ({
						c: /** @type {const} */ ('material'),
						h: `/material/m${i}`,
						t: `M${i}`,
						g: Array.from({ length: 12 }, (_, j) => `etiqueta-${j}`)
					})),
					tags: {}
				},
				posts: [],
				wikiPosts: [],
				profiles: []
			},
			{}
		);
		const tags = await screen('ct:m', deps({ inline: { source: async () => many } }));
		const rows = step(tags).reply_markup.inline_keyboard;
		const tagRows = rows.filter((/** @type {any[]} */ r) =>
			r.every((b) => /^c:m:0:/.test(b.callback_data ?? ''))
		);
		expect(tagRows.flat()).toHaveLength(SECTION_TAGS_MAX);
		for (const r of tagRows) expect(r.length).toBeLessThanOrEqual(2);
	});

	it('una etiqueta que no está en esa sección (vieja o armada a mano): avisa y no cambia nada', async () => {
		for (const data of [
			'c:m:0:zzzzz',
			`c:a:0:${shortHash('cuidados')}`,
			`ct:w:${shortHash('cuidados')}`,
			`cd:m:${docHash(MATERIAL[0].doc)}:0:zzzzz`
		]) {
			const plan = await screen(data);
			expect(plan.steps, data).toEqual([]);
			expect(plan.callback.text, data).toBe(T('secciones.no_esta'));
		}
	});
});

describe('la tarjeta y volver', () => {
	it('la tarjeta compacta, con «‹ Volver» a la misma página (y etiqueta) e «🏠 Inicio»', async () => {
		const tag = shortHash('cuerdas');
		const list = await screen(`c:m:1:${tag}`);
		const item = buttons(list).find((b) => b.text === '📚 Material 00');
		expect(item.callback_data).toBe(`cd:m:${docHash(MATERIAL[0].doc)}:1:${tag}`);
		const card = await screen(item.callback_data);
		expect(step(card).text).toContain('<b>📚 Material 00</b>\nResumen 0');
		expect(step(card).reply_markup.inline_keyboard).toEqual([
			[{ text: T('sitio.boton_ver'), url: `${ORIGIN}/material/material-0` }],
			[
				{ text: T('inicio.boton_volver'), callback_data: `c:m:1:${tag}` },
				{ text: T('inicio.boton_inicio'), callback_data: 'h' }
			]
		]);
		// «‹ Volver» vuelve a esa misma página.
		const back = await screen(`c:m:1:${tag}`);
		expect(step(back).text).toContain('2/2');
	});

	it('Kinkipedia, amigues y series también abren su tarjeta', async () => {
		for (const [s, href, title] of [
			['w', '/wiki/cuerdas', '<b>📖 🪢 Cuerdas</b>'],
			['a', '/amigues/zoe', '<b>👥 Zoe Inventade</b>'],
			['s', '/wiki/noche-b', '<b>📖 🌙 Noche B</b>']
		]) {
			const doc = /** @type {SearchDoc} */ (DOCS.find((d) => d.h === href));
			const card = await screen(`cd:${s}:${docHash(doc)}:0`);
			expect(step(card).text, href).toContain(title);
			expect(button(card, T('inicio.boton_volver')).callback_data).toBe(`c:${s}:0`);
		}
	});

	it('algo de otra sección, un evento o un perfil no listado no se abre aunque el botón lo diga', async () => {
		const other = /** @type {SearchDoc} */ (DOCS.find((d) => d.h === '/wiki/cuerdas'));
		const event = /** @type {SearchDoc} */ (DOCS.find((d) => d.c === 'calendario'));
		const unlisted = /** @type {SearchDoc} */ (DOCS.find((d) => d.h.includes('no-listado')));
		for (const data of [
			`cd:m:${docHash(other)}:0`,
			`cd:w:${docHash(event)}:0`,
			`cd:a:${docHash(unlisted)}:0`,
			'cd:m:zzzzz:0'
		]) {
			const plan = await screen(data);
			expect(plan.steps, data).toEqual([]);
			expect(plan.callback.text).toBe(T('secciones.no_esta'));
		}
	});

	it('en un grupo: la misma lista, solo para quien tocó (efímero)', async () => {
		const plan = /** @type {any} */ (
			await planUpdate(tap('c:m:0', { id: -100, type: 'supergroup' }), { ...deps(), media: true })
		);
		expect(JSON.stringify(plan)).toContain('Material 11');
		expect(JSON.stringify(plan)).not.toContain('"photo"');
	});
});

describe('callback_data', () => {
	it('todo botón de todas las pantallas entra en 64 bytes', async () => {
		const longSource = makeInlineSource(
			{
				raw: {
					v: 1,
					docs: Array.from({ length: 30 }, (_, i) => ({
						c: /** @type {const} */ ('material'),
						h: `/material/${'x'.repeat(200)}-${i}`,
						t: `${'Título larguísimo con tildes ñandú '.repeat(5)}${i}`,
						g: [LONG_TAG, `${LONG_TAG}-${i % 3}`]
					})),
					tags: { [LONG_TAG]: [`${'Nombre larguísimo de etiqueta '.repeat(4)}`] }
				},
				posts: [],
				wikiPosts: [],
				profiles: []
			},
			{}
		);
		const d = deps({ inline: { source: async () => longSource } });
		const tag = shortHash(LONG_TAG);
		/** @type {string[]} */
		const all = [];
		for (const data of [
			'h',
			'c:m:0',
			'c:m:5',
			`c:m:3:${tag}`,
			'ct:m',
			`ct:m:${tag}`,
			`cd:m:${docHash(/** @type {any} */ ({ h: `/material/${'x'.repeat(200)}-7` }))}:5:${tag}`
		]) {
			const plan = await screen(data, d);
			expect(plan.steps.length, data).toBeGreaterThan(0);
			for (const b of buttons(plan)) {
				if (b.callback_data) all.push(b.callback_data);
				expect(byteLength(b.text), b.text).toBeLessThanOrEqual(64);
			}
		}
		expect(all.length).toBeGreaterThan(20);
		for (const data of all) {
			expect(byteLength(data), data).toBeLessThanOrEqual(CALLBACK_MAX_BYTES);
			expect(decodeNav(data), data).not.toBeNull();
		}
	});

	it('ida y vuelta, también con los números y hashes más largos', () => {
		/** @type {import('./nav.js').NavState[]} */
		const states = [
			{ screen: 'section', section: 'm', page: 0 },
			{ screen: 'section', section: 'w', page: 999, tag: 'zzzzzzz' },
			{ screen: 'section_tags', section: 'a' },
			{ screen: 'section_tags', section: 's', tag: 'zzzzzzz' },
			{ screen: 'section_doc', section: 'a', hash: 'zzzzzzz', page: 999 },
			{ screen: 'section_doc', section: 'm', hash: 'zzzzzzz', page: 999, tag: 'zzzzzzz' }
		];
		for (const state of states) {
			const data = encodeNav(/** @type {any} */ (state));
			expect(byteLength(data)).toBeLessThanOrEqual(CALLBACK_MAX_BYTES);
			expect(decodeNav(data)).toEqual(state);
		}
	});

	it('lo roto no se entiende', () => {
		for (const data of [
			'c:x:0',
			'c:m',
			'c:m:a',
			'c:m:1234',
			'c:m:0:',
			'c:m:0:ZZ',
			'c:m:0:abc:def',
			'ct:',
			'ct:q',
			'ct:m:',
			'cd:m:abc',
			'cd:m::0',
			'cd:m:abc:0:',
			'cd:m:abc:0:x:y'
		]) {
			expect(decodeNav(data), data).toBeNull();
		}
	});
});

describe('sin el índice y con el interruptor apagado', () => {
	it('sin el índice: «Algo salió mal», sin cambiar el mensaje', async () => {
		const plan = await screen('c:m:0', deps({ inline: { source: async () => null } }));
		expect(plan.steps).toEqual([]);
		expect(plan.callback.text).toBe(T('errores.algo_salio_mal'));
	});

	it('con `telegram_bot` apagado el webhook contesta 200 sin leer el índice', async () => {
		const sourceFn = vi.fn(async () => source);
		const secret = 'secreto-de-prueba-bastante-largo';
		const res = await handleWebhook({
			request: new Request('https://ejemplo.test/api/telegram', {
				method: 'POST',
				headers: { 'x-telegram-bot-api-secret-token': secret },
				body: JSON.stringify(tap('c:m:0'))
			}),
			secret,
			enabled: false,
			origin: ORIGIN,
			listUpcoming: async () => [],
			inline: { source: sourceFn }
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('');
		expect(sourceFn).not.toHaveBeenCalled();
	});
});

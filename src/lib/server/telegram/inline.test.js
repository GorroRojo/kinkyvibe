/**
 * El modo inline del bot (inline.js): qué se muestra para una consulta vacía, con texto y con
 * prefijo; el orden (el de la búsqueda del sitio); las páginas (`next_offset`); las miniaturas
 * (siempre chiquitas, nunca la imagen entera); el escape del HTML; la tarjeta de un evento y el
 * tope por persona. Datos inventados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupHits, prepareIndex, search } from '$lib/utils/search';
import {
	EMPTY_MATERIAL,
	INLINE_CACHE_SECONDS,
	INLINE_PAGE,
	INLINE_RATE,
	INLINE_TEXTS,
	THUMB_SIZE,
	inlineThumbUrl,
	parseInlineQuery,
	parseOffset,
	planInlineQuery,
	resetInlineRate,
	selectInline
} from './inline.js';
import { makeInlineSource } from './inlineSource.js';

const NOW = Date.parse('2031-01-10T12:00:00-03:00');
const PROD = 'https://kinkyvibe.ar';
const HASH = 'a'.repeat(64);
const IMG = `/media/img/${HASH}.webp`;

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */

/**
 * Una fuente con un índice inventado (y lo leído para los extras, como lo arma publicIndex.js).
 *
 * @param {SearchDoc[]} docs
 * @param {{ posts?: any[], profiles?: any[], avatars?: Map<number, string>, series?: Map<string, string> }} [more]
 */
function sourceOf(docs, { posts = [], profiles = [], avatars, series } = {}) {
	return makeInlineSource(
		{ raw: { v: 1, docs, tags: {} }, posts, wikiPosts: [], profiles },
		{ avatars, series }
	);
}

/** @param {string} slug @param {string} start @param {Partial<SearchDoc>} [o] */
const eventDoc = (slug, start, o = {}) => ({
	c: /** @type {const} */ ('calendario'),
	h: `/calendario/${slug}`,
	t: `Evento ${slug}`,
	d: new Date(start).toISOString(),
	...o
});
/** @param {string} slug @param {Partial<SearchDoc>} [o] */
const materialDoc = (slug, o = {}) => ({
	c: /** @type {const} */ ('material'),
	h: `/material/${slug}`,
	t: `Material ${slug}`,
	s: `Resumen de ${slug}`,
	...o
});
/** @param {string} slug @param {string} start @param {Record<string, any>} [meta] */
const eventPost = (slug, start, meta = {}) => ({
	path: `/calendario/${slug}`,
	meta: { postID: slug, category: 'calendario', title: `Evento ${slug}`, start, ...meta }
});
/** @param {string} slug @param {string} date @param {Record<string, any>} [meta] */
const materialPost = (slug, date, meta = {}) => ({
	path: `/material/${slug}`,
	meta: {
		postID: slug,
		category: 'material',
		title: `Material ${slug}`,
		published_date: date,
		...meta
	}
});

/**
 * @param {Partial<{ query: string, offset: string, id: string, from: number }>} q
 * @param {import('./inline.js').InlineSource} source
 * @param {{ origin?: string, events?: any }} [o]
 */
async function answer(q, source, { origin = PROD, events } = {}) {
	const plan = await planInlineQuery(
		{
			id: q.id ?? 'iq-1',
			from: { id: q.from ?? 42 },
			query: q.query ?? '',
			offset: q.offset ?? ''
		},
		{ source: async () => source, events, origin, now: () => NOW }
	);
	return /** @type {any} */ (plan?.steps[0] ?? null);
}

beforeEach(() => resetInlineRate());
afterEach(() => resetInlineRate());

describe('parseInlineQuery', () => {
	it('separa los prefijos (sin importar tildes ni mayúsculas) y deja el resto', () => {
		expect(parseInlineQuery('evento: cuerdas')).toEqual({ types: ['calendario'], text: 'cuerdas' });
		expect(parseInlineQuery('Material:guía')).toEqual({ types: ['material'], text: 'guía' });
		expect(parseInlineQuery('wiki: ')).toEqual({ types: ['wiki', 'serie'], text: '' });
		expect(parseInlineQuery('amigues:')).toEqual({ types: ['amigues'], text: '' });
		// Un prefijo que no existe es parte del texto.
		expect(parseInlineQuery('hora: 21')).toEqual({ types: null, text: 'hora: 21' });
		expect(parseInlineQuery('  ')).toEqual({ types: null, text: '' });
		expect(parseInlineQuery(undefined)).toEqual({ types: null, text: '' });
	});
});

describe('selectInline', () => {
	const docs = [
		eventDoc('pasado', '2030-12-01T20:00:00-03:00'),
		eventDoc('lejano', '2031-03-01T20:00:00-03:00'),
		eventDoc('cercano', '2031-01-15T20:00:00-03:00'),
		...Array.from({ length: 7 }, (_, i) => materialDoc(`nota-${i}`)),
		{ c: /** @type {const} */ ('wiki'), h: '/wiki/cuerdas', t: 'Cuerdas', s: 'Atar con cuerdas' },
		{ c: /** @type {const} */ ('serie'), h: '/wiki/picantearla', t: 'Picantearla' },
		{ c: /** @type {const} */ ('amigues'), h: '/amigues/persona-inventada', t: 'Persona Inventada' }
	];
	const posts = Array.from({ length: 7 }, (_, i) => materialPost(`nota-${i}`, `2030-0${i + 1}-01`));
	const source = sourceOf(docs, { posts });

	it('vacía: primero los próximos eventos (del más cercano), después algunos materiales recientes', () => {
		const hrefs = selectInline(source, { types: null, text: '' }, NOW).map((d) => d.h);
		expect(hrefs.slice(0, 2)).toEqual(['/calendario/cercano', '/calendario/lejano']);
		expect(hrefs).not.toContain('/calendario/pasado');
		expect(hrefs.slice(2)).toEqual(
			['nota-6', 'nota-5', 'nota-4', 'nota-3', 'nota-2'].map((s) => `/material/${s}`)
		);
		expect(hrefs.length).toBe(2 + EMPTY_MATERIAL);
	});

	it('con texto: el mismo orden que la búsqueda del sitio (search + groupHits)', () => {
		const prepared = prepareIndex({ v: 1, docs, tags: {} });
		for (const q of ['cuerdas', 'evento', 'material nota', 'persona']) {
			const site = groupHits(search(prepared, q), NOW).flatMap((g) => g.hits.map((h) => h.doc.h));
			expect(
				selectInline(source, { types: null, text: q }, NOW).map((d) => d.h),
				q
			).toEqual(site);
		}
	});

	it('con prefijo: solo ese tipo; sin texto, todo lo de ese tipo', () => {
		/** @param {string} q */
		const kinds = (q) => selectInline(source, parseInlineQuery(q), NOW).map((d) => d.c);
		expect(new Set(kinds('evento: evento'))).toEqual(new Set(['calendario']));
		expect(kinds('evento:')).toEqual(['calendario', 'calendario']);
		expect(kinds('material:')).toEqual(Array(7).fill('material'));
		expect(new Set(kinds('wiki:'))).toEqual(new Set(['wiki', 'serie']));
		expect(kinds('amigues:')).toEqual(['amigues']);
		expect(kinds('amigues: cuerdas')).toEqual([]);
	});
});

describe('inlineThumbUrl', () => {
	it('una imagen de la biblioteca en producción: la miniatura chiquita, nunca la original', () => {
		const thumb = inlineThumbUrl(IMG, PROD);
		expect(thumb).toBe(
			`${PROD}/cdn-cgi/image/width=${THUMB_SIZE},height=${THUMB_SIZE},fit=cover,format=jpeg,quality=75${IMG}`
		);
		expect(thumb).not.toContain('onerror=redirect');
		// La copia de un evento real en el modo demo apunta al sitio público.
		expect(inlineThumbUrl(`${PROD}${IMG}`, 'https://rama.workers.dev')).toBe(thumb);
	});

	it('sin forma de achicarla (preview, local, imagen vieja del repo, otro sitio): sin miniatura', () => {
		expect(inlineThumbUrl(IMG, 'https://rama.kinkyvibe.workers.dev')).toBeNull();
		expect(inlineThumbUrl(IMG, 'http://localhost:5173')).toBeNull();
		expect(inlineThumbUrl('/_app/immutable/assets/foto.webp', PROD)).toBeNull();
		expect(inlineThumbUrl('https://otro.example/media/img/x.webp', PROD)).toBeNull();
		expect(inlineThumbUrl(`${IMG}?w=2000`, PROD)).toBeNull();
		expect(inlineThumbUrl(undefined, PROD)).toBeNull();
	});
});

describe('planInlineQuery', () => {
	it('la respuesta: answerInlineQuery, igual para todes, guardada un rato, hasta 50', async () => {
		const source = sourceOf([eventDoc('cercano', '2031-01-15T20:00:00-03:00')]);
		const a = await answer({ query: '' }, source);
		expect(a.method).toBe('answerInlineQuery');
		expect(a.inline_query_id).toBe('iq-1');
		expect(a.is_personal).toBe(false);
		expect(a.cache_time).toBe(INLINE_CACHE_SECONDS);
		expect(INLINE_CACHE_SECONDS).toBeGreaterThanOrEqual(60);
		expect(INLINE_CACHE_SECONDS).toBeLessThanOrEqual(300);
		expect(INLINE_PAGE).toBeLessThanOrEqual(50);
		expect(a.results).toHaveLength(1);
		expect(a.results[0]).toMatchObject({ type: 'article', title: 'Evento cercano' });
		expect(a.next_offset).toBe('');
	});

	it('páginas: next_offset hasta el final, ids únicos, un offset raro vuelve al principio', async () => {
		const docs = Array.from({ length: 45 }, (_, i) =>
			materialDoc(`nota-${String(i).padStart(2, '0')}`, { t: `Nota inventada ${i}` })
		);
		const source = sourceOf(docs);
		const first = await answer({ query: 'material:' }, source);
		expect(first.results).toHaveLength(INLINE_PAGE);
		expect(first.next_offset).toBe(String(INLINE_PAGE));
		const second = await answer({ query: 'material:', offset: first.next_offset }, source);
		expect(second.results).toHaveLength(INLINE_PAGE);
		expect(second.next_offset).toBe(String(2 * INLINE_PAGE));
		const third = await answer({ query: 'material:', offset: second.next_offset }, source);
		expect(third.results).toHaveLength(45 - 2 * INLINE_PAGE);
		expect(third.next_offset).toBe('');
		const ids = [...first.results, ...second.results, ...third.results].map((r) => r.id);
		expect(new Set(ids).size).toBe(45);
		const titles = [...first.results, ...second.results, ...third.results].map((r) => r.title);
		expect(new Set(titles).size).toBe(45);
		expect(parseOffset('abc')).toBe(0);
		expect(parseOffset('-5')).toBe(0);
		expect(parseOffset('99999')).toBe(0);
		expect((await answer({ query: 'material:', offset: 'x' }, source)).results[0].id).toBe('0');
	});

	it('miniaturas: la chiquita de la imagen de cada cosa (evento, material, perfil, serie)', async () => {
		const docs = [
			eventDoc('con-foto', '2031-01-15T20:00:00-03:00'),
			materialDoc('con-portada'),
			{ c: /** @type {const} */ ('amigues'), h: '/amigues/con-avatar', t: 'Con Avatar' },
			{ c: /** @type {const} */ ('serie'), h: '/wiki/serie-inventada', t: 'Serie inventada' },
			materialDoc('sin-imagen')
		];
		const source = sourceOf(docs, {
			posts: [
				eventPost('con-foto', '2031-01-15T20:00:00-03:00', { featured: IMG }),
				materialPost('con-portada', '2030-01-01', { featured: IMG }),
				materialPost('sin-imagen', '2030-01-02')
			],
			profiles: [
				{ object: { id: 7, slug: 'con-avatar', title: 'Con Avatar', data: {} }, legacySlug: null }
			],
			avatars: new Map([[7, `img/${HASH}.webp`]]),
			series: new Map([['serie inventada', `img/${HASH}.webp`]])
		});
		const all = [];
		for (const q of ['evento:', 'material:', 'amigues:', 'wiki:']) {
			all.push(...(await answer({ query: q }, source)).results);
		}
		const byTitle = Object.fromEntries(all.map((r) => [r.title, r]));
		for (const title of [
			'Evento con-foto',
			'Material con-portada',
			'Con Avatar',
			'Serie inventada'
		]) {
			expect(byTitle[title].thumbnail_url, title).toBe(inlineThumbUrl(IMG, PROD));
			expect(byTitle[title].thumbnail_width).toBe(THUMB_SIZE);
			expect(byTitle[title].thumbnail_url).not.toBe(`${PROD}${IMG}`);
		}
		expect(byTitle['Material sin-imagen'].thumbnail_url).toBeUndefined();
		// En un preview, ninguna (no se puede achicar).
		const preview = await answer({ query: 'material:' }, source, {
			origin: 'https://rama.kinkyvibe.workers.dev'
		});
		expect(preview.results.every((/** @type {any} */ r) => !r.thumbnail_url)).toBe(true);
	});

	it('escapa el HTML de la tarjeta; el título y la descripción van como texto', async () => {
		const source = sourceOf([
			materialDoc('raro', { t: 'Cuerdas <b>& "nudos"</b>', s: 'Uno <a href="x">y</a> & otro' })
		]);
		const [r] = (await answer({ query: 'material:' }, source)).results;
		expect(r.title).toBe('Cuerdas <b>& "nudos"</b>');
		expect(r.description).toBe('Uno <a href="x">y</a> & otro');
		expect(r.input_message_content.parse_mode).toBe('HTML');
		expect(r.input_message_content.message_text).toBe(
			'<b>Cuerdas &lt;b&gt;&amp; &quot;nudos&quot;&lt;/b&gt;</b>\n' +
				'Uno &lt;a href=&quot;x&quot;&gt;y&lt;/a&gt; &amp; otro'
		);
		expect(r.reply_markup.inline_keyboard).toEqual([
			[{ text: INLINE_TEXTS.viewOnSite, url: `${PROD}/material/raro` }]
		]);
	});

	it('el mensaje mandado lleva la vista previa grande de la página, arriba del texto', async () => {
		const source = sourceOf([materialDoc('con-foto')]);
		const [r] = (await answer({ query: 'material:' }, source)).results;
		expect(r.input_message_content.link_preview_options).toEqual({
			url: `${PROD}/material/con-foto`,
			prefer_large_media: true,
			show_above_text: true
		});
		// Sin https (dev local) Telegram no arma la vista previa: va apagada.
		const local = await answer({ query: 'material:' }, source, { origin: 'http://localhost:5173' });
		expect(local.results[0].input_message_content.link_preview_options).toEqual({
			is_disabled: true
		});
	});

	it('la tarjeta de un evento: fecha, lugar público, «Ver en el sitio» y «Entradas» si vende', async () => {
		const docs = [
			eventDoc('con-entradas', '2031-01-15T20:00:00-03:00'),
			eventDoc('agotado', '2031-01-16T20:00:00-03:00'),
			eventDoc('sin-entradas', '2031-01-17T20:00:00-03:00')
		];
		const posts = [
			eventPost('con-entradas', '2031-01-15T20:00:00-03:00'),
			eventPost('agotado', '2031-01-16T20:00:00-03:00'),
			eventPost('sin-entradas', '2031-01-17T20:00:00-03:00')
		];
		/** @type {string[][]} */
		const asked = [];
		const events = async (/** @type {any[]} */ metas) => {
			asked.push(metas.map((m) => m.postID));
			return new Map([
				[
					'con-entradas',
					{
						place: 'Lugar Inventado, Barrio Inventado',
						area: 'Barrio Inventado, CABA',
						ticket: {
							kind: 'buy',
							href: '/calendario/con-entradas/entradas',
							text: 'Comprar entradas'
						}
					}
				],
				[
					'agotado',
					{
						place: 'Lugar a confirmar',
						area: 'Lugar a confirmar',
						ticket: { kind: 'note', text: 'Agotadas' }
					}
				]
			]);
		};
		const a = await answer({ query: 'evento:' }, sourceOf(docs, { posts }), { events });
		// Una sola lectura para todos los eventos de la página.
		expect(asked).toEqual([['con-entradas', 'agotado', 'sin-entradas']]);
		const [buy, soldout, plain] = a.results;
		expect(buy.description).toMatch(/^.+ · Barrio Inventado, CABA$/);
		expect(buy.input_message_content.message_text).toContain(
			'📍 Lugar Inventado, Barrio Inventado'
		);
		expect(buy.input_message_content.message_text).toContain('<tg-time unix=');
		expect(buy.reply_markup.inline_keyboard).toEqual([
			[
				{ text: INLINE_TEXTS.viewOnSite, url: `${PROD}/calendario/con-entradas` },
				{ text: INLINE_TEXTS.tickets, url: `${PROD}/calendario/con-entradas/entradas` }
			]
		]);
		expect(soldout.input_message_content.message_text).toContain('🎟 Agotadas');
		expect(soldout.reply_markup.inline_keyboard[0]).toHaveLength(1);
		expect(plain.reply_markup.inline_keyboard).toEqual([
			[{ text: INLINE_TEXTS.viewOnSite, url: `${PROD}/calendario/sin-entradas` }]
		]);
	});

	it('si falla el lugar y la venta, contesta igual (sin eso)', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const docs = [eventDoc('uno', '2031-01-15T20:00:00-03:00')];
		const posts = [eventPost('uno', '2031-01-15T20:00:00-03:00')];
		const a = await answer({ query: '' }, sourceOf(docs, { posts }), {
			events: async () => {
				throw new Error('D1 caída');
			}
		});
		expect(a.results).toHaveLength(1);
		expect(a.results[0].input_message_content.message_text).not.toContain('📍');
		spy.mockRestore();
	});

	it('sin resultados: la lista vacía con el botón que abre el buscador del bot', async () => {
		const a = await answer({ query: 'zzzzzz' }, sourceOf([materialDoc('nota')]));
		expect(a.results).toEqual([]);
		expect(a.button).toEqual({ text: INLINE_TEXTS.noResults, start_parameter: 'buscar' });
		const empty = await answer({ query: '' }, sourceOf([]));
		expect(empty.button).toEqual({ text: INLINE_TEXTS.nothingYet, start_parameter: 'buscar' });
	});

	it('un update sin id o sin quién pregunta, o sin fuente: no contesta', async () => {
		const source = sourceOf([materialDoc('nota')]);
		const deps = { source: async () => source, origin: PROD, now: () => NOW };
		expect(await planInlineQuery({ from: { id: 1 }, query: '' }, deps)).toBeNull();
		expect(await planInlineQuery({ id: 'x', query: '' }, deps)).toBeNull();
		expect(
			await planInlineQuery(
				{ id: 'x', from: { id: 1 }, query: '' },
				{ ...deps, source: async () => null }
			)
		).toBeNull();
	});

	it('tope por persona: pasado el límite del minuto no contesta (y no lee la fuente)', async () => {
		const source = sourceOf([materialDoc('nota')]);
		let reads = 0;
		const deps = {
			source: async () => {
				reads++;
				return source;
			},
			origin: PROD,
			now: () => NOW
		};
		const q = { id: 'iq', from: { id: 99 }, query: 'material:' };
		for (let i = 0; i < INLINE_RATE.limit; i++)
			expect(await planInlineQuery(q, deps)).not.toBeNull();
		expect(await planInlineQuery(q, deps)).toBeNull();
		expect(reads).toBe(INLINE_RATE.limit);
		// Otra persona, sí; y pasado el minuto, también.
		expect(await planInlineQuery({ ...q, from: { id: 100 } }, deps)).not.toBeNull();
		const later = { ...deps, now: () => NOW + INLINE_RATE.windowMs };
		expect(await planInlineQuery(q, later)).not.toBeNull();
	});
});

/**
 * La Kinkipedia del bot por las ramas del árbol de etiquetas (sections.js, como /wiki): lo de
 * arriba de todo, abrir una rama («📂»), «‹ Volver» a la rama madre, la tarjeta con «‹ Volver» a
 * la rama de la que vino, una etiqueta con dos madres, ramas sin nada que mostrar y botones viejos
 * o armados a mano. Índice y árbol inventados, sin red.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBotText } from '$lib/utils/botTexts.js';
import tagsFactory from '$lib/utils/tags.js';
import { planUpdate } from './router.js';
import { byteLength, CALLBACK_MAX_BYTES, shortHash } from './nav.js';
import { docHash } from './siteScreens.js';
import { resetInlineRate } from './inline.js';
import { makeInlineSource, tagTree } from './inlineSource.js';
import { sectionView, wikiTree } from './sections.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */

const T = renderBotText;

/**
 * El árbol: Zapatos, Prácticas › Cuerdas › Nudos (Nudos también es hija de Zapatos) y Azotes, y
 * Vacía. El orden del árbol (el de /wiki) no es el alfabético: Zapatos antes que Prácticas,
 * Cuerdas antes que Azotes.
 */
const TAGS = tagsFactory(
	/** @type {any} */ ([
		{ id: 'root', children: ['zapatos', 'practicas', 'vacia'] },
		{ id: 'practicas', visible_name: 'Prácticas', children: ['cuerdas', 'azotes'] },
		{ id: 'azotes', visible_name: 'Azotes' },
		{ id: 'cuerdas', visible_name: 'Cuerdas', children: ['nudos'] },
		{ id: 'nudos', visible_name: 'Nudos' },
		{ id: 'zapatos', visible_name: 'Zapatos', children: ['nudos'] },
		// Una rama sin ninguna entrada (ni ella ni sus hijas): no se ve, como en /wiki.
		{ id: 'vacia', visible_name: 'Vacía', children: ['hija-vacia'] },
		{ id: 'hija-vacia', visible_name: 'Hija vacía' }
	])
);

/** @type {SearchDoc[]} */
const DOCS = [
	{ c: 'wiki', h: '/wiki/cuerdas', t: 'Cuerdas', s: 'Atar con cuerdas', g: ['cuerdas'] },
	{ c: 'wiki', h: '/wiki/nudos', t: 'Nudos', g: ['nudos'] },
	{ c: 'wiki', h: '/wiki/zapatos', t: 'Zapatos', g: ['zapatos'] },
	{ c: 'wiki', h: '/wiki/azotes', t: 'Azotes', g: ['azotes'] },
	// Otra entrada de la misma etiqueta: va adentro de la rama de Cuerdas.
	{ c: 'wiki', h: '/wiki/guia-de-cuerdas', t: 'Guía de cuerdas', g: ['cuerdas'] },
	// Una entrada sin etiqueta en el árbol: arriba de todo.
	{ c: 'wiki', h: '/wiki/suelta', t: 'Suelta', g: ['no-esta-en-el-arbol'] },
	// Una serie no es de la Kinkipedia del bot (tiene su sección).
	{ c: 'serie', h: '/wiki/noche', t: 'Noche', g: ['noche'] }
];

const source = makeInlineSource({
	raw: { v: 1, docs: DOCS, tags: {} },
	posts: [],
	wikiPosts: [],
	profiles: [],
	tags: TAGS
});

const deps = () => ({
	listUpcoming: vi.fn(async () => []),
	origin: 'https://kinkyvibe.ar',
	now: () => Date.parse('2031-01-08T12:00:00-03:00'),
	card: vi.fn(async () => ({})),
	botUsername: 'BotDePrueba',
	inline: { source: vi.fn(async () => source) }
});

/** @param {string} data @returns {Promise<any>} */
const screen = (data) =>
	planUpdate(
		{
			callback_query: {
				id: 'cb',
				from: { id: 77 },
				data,
				message: { message_id: 9, chat: { id: 42, type: 'private' } }
			}
		},
		deps()
	);

/** @param {any} plan @returns {any[]} */
const buttons = (plan) => plan.steps[0].reply_markup.inline_keyboard.flat();
/** @param {any} plan */
const labels = (plan) => buttons(plan).map((b) => b.text);
/** @param {any} plan @param {string} text */
const button = (plan, text) => buttons(plan).find((b) => b.text === text);
/** @param {string} href */
const doc = (href) => /** @type {SearchDoc} */ (DOCS.find((d) => d.h === href));

beforeEach(() => resetInlineRate());

describe('el árbol de etiquetas en la fuente', () => {
	it('de cada etiqueta, sus madres, su nombre y sus hijas en el orden del árbol (sin alias)', () => {
		const tree = /** @type {Map<string, any>} */ (tagTree(TAGS));
		expect(tree.get('nudos')).toEqual({
			parents: ['cuerdas', 'zapatos'],
			name: 'Nudos',
			children: []
		});
		expect(tree.get('practicas')).toEqual({
			parents: ['root'],
			name: 'Prácticas',
			children: ['cuerdas', 'azotes']
		});
		// root solo lleva el orden de lo de arriba de todo.
		expect(tree.get('root')).toMatchObject({
			parents: [],
			children: ['zapatos', 'practicas', 'vacia']
		});
		expect(source.tree).toBeDefined();
	});

	it('sin árbol, la Kinkipedia es la lista por nombre de antes', () => {
		const flat = makeInlineSource({
			raw: { v: 1, docs: DOCS, tags: {} },
			posts: [],
			wikiPosts: [],
			profiles: []
		});
		const view = /** @type {any} */ (sectionView(flat, 'w', undefined));
		expect(view.branch).toBeUndefined();
		expect(view.docs.map((/** @type {SearchDoc} */ d) => d.t)).toEqual([
			'Azotes',
			'Cuerdas',
			'Guía de cuerdas',
			'Nudos',
			'Suelta',
			'Zapatos'
		]);
	});
});

describe('wikiTree', () => {
	const tree = wikiTree(
		/** @type {any} */ (source.tree),
		DOCS.filter((d) => d.c === 'wiki')
	);

	it('arriba: las ramas que tienen algo en el orden del árbol y después las sueltas', () => {
		expect(tree.items('root').map((i) => (i.kind === 'doc' ? i.doc.t : `📂 ${i.name}`))).toEqual([
			'📂 Zapatos',
			'📂 Prácticas',
			'Suelta'
		]);
	});

	it('las hijas de una rama, en el orden del árbol (no por nombre)', () => {
		expect(
			tree.items('practicas').map((i) => (i.kind === 'doc' ? i.doc.t : `📂 ${i.name}`))
		).toEqual(['📂 Cuerdas', 'Azotes']);
	});

	it('una rama: su entrada primero, después sus hijas y las otras entradas de esa etiqueta', () => {
		expect(tree.items('cuerdas').map((i) => (i.kind === 'doc' ? i.doc.t : i.name))).toEqual([
			'Cuerdas',
			'Nudos',
			'Guía de cuerdas'
		]);
	});

	it('una etiqueta con dos madres está en las dos', () => {
		expect(tree.items('zapatos').map((i) => (i.kind === 'doc' ? i.doc.t : i.name))).toEqual([
			'Zapatos',
			'Nudos'
		]);
	});

	it('solo se abre una rama con algo adentro', () => {
		expect(tree.branch(shortHash('cuerdas'))).toMatchObject({ id: 'cuerdas', count: 3 });
		expect(tree.branch(shortHash('nudos'))).toBeNull();
		expect(tree.branch(shortHash('vacia'))).toBeNull();
		expect(tree.branch('zzzzz')).toBeNull();
	});

	it('«‹ Volver» va a la primera madre (o arriba de todo)', () => {
		expect(tree.back('cuerdas')).toBe(shortHash('practicas'));
		expect(tree.back('practicas')).toBeNull();
	});
});

describe('la Kinkipedia en el bot', () => {
	it('arriba: las ramas con «📂», sin filtro por etiqueta ni «‹ Volver»', async () => {
		const plan = await screen('c:w:0');
		const text = plan.steps[0].text;
		expect(text).toContain('<b>📖 Kinkipedia</b>');
		expect(text).toContain(`📂 <b>Prácticas</b>\n${T('secciones.rama_cantidad', { cantidad: 2 })}`);
		expect(text).not.toContain('Vacía');
		expect(text).not.toContain('Noche');
		expect(labels(plan)).toEqual([
			T('secciones.boton_rama', { rama: 'Zapatos' }),
			T('secciones.boton_rama', { rama: 'Prácticas' }),
			'📖 Suelta',
			T('inicio.boton_inicio')
		]);
		expect(button(plan, T('secciones.boton_rama', { rama: 'Prácticas' })).callback_data).toBe(
			`c:w:0:${shortHash('practicas')}`
		);
	});

	it('una rama: su nombre arriba, lo de adentro y «‹ Volver» a la madre', async () => {
		const plan = await screen(`c:w:0:${shortHash('cuerdas')}`);
		expect(plan.steps[0].text).toContain(
			`${T('secciones.titulo_kinkipedia')} · ${T('secciones.rama', { rama: 'Cuerdas' })}`
		);
		expect(labels(plan)).toEqual([
			'📖 Cuerdas',
			'📖 Nudos',
			'📖 Guía de cuerdas',
			T('inicio.boton_volver'),
			T('inicio.boton_inicio')
		]);
		expect(button(plan, T('inicio.boton_volver')).callback_data).toBe(
			`c:w:0:${shortHash('practicas')}`
		);
		const up = await screen(`c:w:0:${shortHash('practicas')}`);
		expect(button(up, T('inicio.boton_volver')).callback_data).toBe('c:w:0');
	});

	it('la tarjeta de una entrada vuelve a la rama de la que vino', async () => {
		const nudos = docHash(doc('/wiki/nudos'));
		for (const branch of ['cuerdas', 'zapatos']) {
			const data = `cd:w:${nudos}:0:${shortHash(branch)}`;
			expect(byteLength(data)).toBeLessThanOrEqual(CALLBACK_MAX_BYTES);
			const card = await screen(data);
			expect(card.steps[0].text, branch).toContain('Nudos');
			expect(button(card, T('inicio.boton_volver')).callback_data).toBe(
				`c:w:0:${shortHash(branch)}`
			);
		}
	});

	it('una rama que no existe, sin nada adentro o una entrada como rama: «ya no está»', async () => {
		for (const data of [
			'c:w:0:zzzzz',
			`c:w:0:${shortHash('vacia')}`,
			`c:w:0:${shortHash('nudos')}`,
			`cd:w:${docHash(doc('/wiki/nudos'))}:0:zzzzz`,
			// Una serie no se abre desde la Kinkipedia.
			`cd:w:${docHash(doc('/wiki/noche'))}:0`
		]) {
			const plan = await screen(data);
			expect(plan.steps, data).toEqual([]);
			expect(plan.callback.text, data).toBe(T('secciones.no_esta'));
		}
	});

	it('las páginas de una rama siguen el orden del árbol, no el alfabético', async () => {
		// Siete hijas al revés del abecedario (G…A): de a 5, G…C en la primera y B, A en la segunda.
		const kids = ['g', 'f', 'e', 'd', 'c', 'b', 'a'];
		const many = makeInlineSource({
			raw: {
				v: 1,
				docs: kids.map((k) => ({ c: 'wiki', h: `/wiki/letra-${k}`, t: `Letra ${k}`, g: [k] })),
				tags: {}
			},
			posts: [],
			wikiPosts: [],
			profiles: [],
			tags: tagsFactory(
				/** @type {any} */ ([
					{ id: 'root', children: ['letras'] },
					{ id: 'letras', visible_name: 'Letras', children: kids },
					...kids.map((k) => ({ id: k, visible_name: `Letra ${k}` }))
				])
			)
		});
		/** @param {string} data @returns {Promise<any>} */
		const open = (data) =>
			planUpdate(
				{
					callback_query: {
						id: 'cb',
						from: { id: 77 },
						data,
						message: { message_id: 9, chat: { id: 42, type: 'private' } }
					}
				},
				{ ...deps(), inline: { source: vi.fn(async () => many) } }
			);
		const docsOf = (/** @type {any} */ plan) =>
			labels(plan).filter((/** @type {string} */ l) => l.startsWith('📖'));
		const first = await open(`c:w:0:${shortHash('letras')}`);
		expect(docsOf(first)).toEqual(['g', 'f', 'e', 'd', 'c'].map((k) => `📖 Letra ${k}`));
		const second = await open(`c:w:1:${shortHash('letras')}`);
		expect(docsOf(second)).toEqual(['b', 'a'].map((k) => `📖 Letra ${k}`));
	});

	it('las otras secciones siguen igual (con su filtro por etiqueta)', async () => {
		const view = /** @type {any} */ (sectionView(source, 's', undefined));
		expect(view.branch).toBeUndefined();
	});
});

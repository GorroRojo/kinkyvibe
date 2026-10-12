/**
 * Datos inventados para las pruebas de Buscar sin resultados (searchSuggest.test.js,
 * noResults.test.js, router-sin-resultados.test.js): un índice chico y un árbol de etiquetas con
 * una etiqueta que todavía no usa nada («shibari», con el alias «kinbaku»), su madre, una hija y
 * una relacionada que sí se usan.
 */
import { tagsFactory } from '$lib/utils/tags.js';
import { makeInlineSource } from './inlineSource.js';

/** @typedef {import('$lib/utils/search').SearchDoc} SearchDoc */

export const ORIGIN = 'https://kinkyvibe.ar';
export const NOW = Date.parse('2031-01-08T12:00:00-03:00');

/** @param {string} slug @param {string} title @param {string} start */
const eventDoc = (slug, title, start) =>
	/** @type {SearchDoc} */ ({ c: 'calendario', h: `/calendario/${slug}`, t: title, d: start });

/** @type {SearchDoc[]} */
export const DOCS = [
	{ c: 'material', h: '/material/guia-cuerdas', t: 'Guía de cuerdas', g: ['cuerdas'] },
	{ c: 'material', h: '/material/nudos', t: 'Nudos básicos', g: ['nudos'] },
	{
		c: 'material',
		h: '/material/suspension',
		t: 'Suspensiones seguras',
		g: ['suspensión'],
		b: 'Un texto largo que habla de cosquillas'
	},
	{ c: 'wiki', h: '/wiki/cuerdas', t: 'Cuerdas', g: ['cuerdas'] },
	{ c: 'amigues', h: '/amigues/persona-latex', t: 'Persona de látex', g: ['látex'] },
	eventDoc('pasado', 'Juntada que ya pasó', '2030-12-01T22:00:00.000Z'),
	eventDoc('primero', 'Taller inventado', '2031-01-09T22:00:00.000Z'),
	eventDoc('segundo', 'Fiesta inventada', '2031-01-11T02:00:00.000Z'),
	eventDoc('tercero', 'Charla inventada', '2031-01-20T21:00:00.000Z'),
	eventDoc('cuarto', 'Jam inventada', '2031-02-01T21:00:00.000Z')
];

export const source = makeInlineSource({
	raw: { v: 1, docs: DOCS, tags: { suspensión: ['Suspensión'] } },
	posts: [],
	wikiPosts: [],
	profiles: []
});

/** El árbol: cuerdas → shibari → suspensión; shibari se relaciona con nudos. */
export const manager = () =>
	tagsFactory(
		/** @type {any} */ ([
			{ id: 'root', children: ['cuerdas', 'látex'] },
			{ id: 'cuerdas', children: ['shibari'] },
			{ id: 'shibari', icon: '🪢', aka: ['kinbaku'], children: ['suspensión'], related: ['nudos'] },
			{ id: 'suspensión' },
			{ id: 'nudos' },
			{ id: 'látex' }
		])
	);

/**
 * @param {'private' | 'group'} [chat]
 * @param {boolean} [sigo]
 * @returns {import('./screens.js').ScreenCtx}
 */
export const ctxOf = (chat = 'private', sigo = true) => ({
	origin: ORIGIN,
	chat,
	now: NOW,
	botUsername: 'BotDePrueba',
	sigo,
	site: true,
	entradas: false
});

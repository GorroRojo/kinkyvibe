import { describe, expect, it } from 'vitest';
import tagsFactory from './tags';
import { SERIES_PARENT } from './series.js';
import { eventCardKey, upcomingEventCards, workshopGroups } from './portada.js';

const NOW = Date.parse('2026-06-01T12:00:00-03:00');

/** Árbol chico, inventado (tagsFactory modifica los objetos: uno nuevo por prueba). */
const tree = () =>
	tagsFactory(
		/** @type {any} */ ([
			{ id: 'root', children: ['calendario'] },
			{ id: 'calendario', children: [SERIES_PARENT, 'taller'] },
			{ id: SERIES_PARENT, children: ['Serie A', 'Serie B'] },
			{ id: 'Serie A', aka: ['serie a'] },
			{ id: 'Serie B', children: ['Serie B Deluxe'] },
			{ id: 'taller' }
		])
	);

/**
 * Un evento inventado.
 * @param {string} slug
 * @param {string} title
 * @param {string} start
 * @param {{ tags?: string[], status?: string }} [extra]
 */
const ev = (slug, title, start, { tags = [], status = 'abierto' } = {}) => ({
	path: `/calendario/${slug}`,
	meta: { postID: slug, title, start, tags, status, category: 'calendario' }
});

/** @param {{ path: string }[]} list */
const paths = (list) => list.map((p) => p.path.replace('/calendario/', ''));

describe('upcomingEventCards', () => {
	it('una tarjeta por título: la edición más próxima de una clase sin serie', () => {
		const posts = [
			ev('clase-3', 'Clases Grupales de Cuerdas', '2026-06-17T19:00-03:00'),
			ev('clase-1', 'Clases Grupales de Cuerdas', '2026-06-03T19:00-03:00'),
			ev('otro', 'Otro evento', '2026-06-05T19:00-03:00'),
			ev('clase-2', '  clases grupales de  cuerdas ', '2026-06-10T19:00-03:00')
		];
		expect(paths(upcomingEventCards(posts, { now: NOW }))).toEqual(['clase-1', 'otro']);
	});

	it('dos eventos distintos con nombres parecidos siguen separados', () => {
		const posts = [
			ev('prueba', 'Evento de prueba: entradas', '2026-06-12T21:00-03:00'),
			ev(
				'prueba-gorra',
				'Evento de prueba: entradas a la gorra (online)',
				'2026-06-19T19:00-03:00'
			),
			ev('taller-cuerdas', 'Taller de cuerdas', '2026-06-20T19:00-03:00'),
			ev('taller-cuerdas-2', 'Taller de cuerdas II', '2026-06-21T19:00-03:00')
		];
		expect(paths(upcomingEventCards(posts, { now: NOW }))).toEqual([
			'prueba',
			'prueba-gorra',
			'taller-cuerdas',
			'taller-cuerdas-2'
		]);
	});

	it('las ediciones pasadas no cuentan: se muestra la próxima, no la que ya fue', () => {
		const posts = [
			ev('clase-pasada', 'Clases Grupales', '2026-05-27T19:00-03:00'),
			ev('clase-proxima', 'Clases Grupales', '2026-06-03T19:00-03:00'),
			ev('solo-pasado', 'Ya fue', '2026-05-20T19:00-03:00')
		];
		expect(paths(upcomingEventCards(posts, { now: NOW }))).toEqual(['clase-proxima']);
	});

	it('las ediciones de una serie (con títulos distintos) son una tarjeta; las de otra serie, no', () => {
		const posts = [
			ev('a-61', 'Serie A (61ª Edición)', '2026-07-04T20:00-03:00', { tags: ['Serie A'] }),
			ev('a-60', 'Serie A (60ª Edición)', '2026-06-06T20:00-03:00', { tags: ['serie a'] }),
			ev('b-1', 'Serie B', '2026-06-07T20:00-03:00', { tags: ['Serie B'] }),
			ev('b-deluxe', 'Serie B Deluxe', '2026-06-08T20:00-03:00', { tags: ['Serie B Deluxe'] }),
			// mismo título que una edición de la serie, pero sin la etiqueta: otro evento
			ev('suelto', 'Serie A (60ª Edición)', '2026-06-09T20:00-03:00')
		];
		expect(paths(upcomingEventCards(posts, { tagManager: tree(), now: NOW }))).toEqual([
			'a-60',
			'b-1',
			'b-deluxe',
			'suelto'
		]);
	});

	it('las partes de un taller son una tarjeta (la próxima parte)', () => {
		const posts = [
			ev('taller', 'Taller intensivo (parte 1 de 2)', '2026-05-30T11:00-03:00'),
			ev('taller-parte-2', 'Taller intensivo (parte 2 de 2)', '2026-06-06T11:00-03:00'),
			ev('taller-parte-3', 'Taller intensivo: cierre', '2026-06-13T11:00-03:00')
		];
		const workshops = { taller: '1', 'taller-parte-2': '1', 'taller-parte-3': '1' };
		expect(paths(upcomingEventCards(posts, { workshops, now: NOW }))).toEqual(['taller-parte-2']);
	});

	it('una edición cancelada no tapa a la siguiente', () => {
		const posts = [
			ev('c-1', 'Clases', '2026-06-03T19:00-03:00', { status: 'cancelado' }),
			ev('c-2', 'Clases', '2026-06-10T19:00-03:00'),
			ev('x', 'Solo cancelado', '2026-06-04T19:00-03:00', { status: 'cancelado' })
		];
		expect(paths(upcomingEventCards(posts, { now: NOW }))).toEqual(['x', 'c-2']);
	});

	it('mantiene el orden por fecha, solo eventos y como mucho `limit`', () => {
		const posts = [
			...Array.from({ length: 12 }, (_, i) =>
				ev(`e-${i + 10}`, `Evento ${i + 10}`, `2026-06-${i + 10}T19:00-03:00`)
			),
			{ path: '/material/m', meta: { title: 'Material', category: 'material', tags: [] } }
		];
		const out = upcomingEventCards(posts, { now: NOW });
		expect(out).toHaveLength(9);
		expect(paths(out)).toEqual(Array.from({ length: 9 }, (_, i) => `e-${i + 10}`));
		expect(upcomingEventCards(posts, { now: NOW, limit: 3 })).toHaveLength(3);
	});
});

describe('eventCardKey', () => {
	it('taller antes que serie, serie antes que título', () => {
		const seriesIds = ['Serie A'];
		const post = ev('x', 'Algo', '2026-06-03T19:00-03:00', { tags: ['Serie A'] });
		expect(eventCardKey(post, { seriesIds, workshops: { x: '2' } })).toBe('taller:2');
		expect(eventCardKey(post, { seriesIds })).toBe('serie:Serie A');
		expect(eventCardKey(post)).toBe('titulo:algo');
	});
});

describe('workshopGroups', () => {
	it('numera los talleres sin mandar su dirección y solo para los eventos de la lista', () => {
		const labels = new Map([
			['taller-oculto', { workshop: 'taller-oculto' }],
			['parte-2', { workshop: 'taller-oculto' }],
			['parte-3', { workshop: 'taller-oculto' }],
			['otro-1', { workshop: 'otro-1' }]
		]);
		const posts = [
			{ meta: { postID: 'parte-2' } },
			{ meta: { postID: 'otro-1' } },
			{ meta: { postID: 'parte-3' } },
			{ meta: { postID: 'suelto' } }
		];
		const out = workshopGroups(posts, labels);
		expect(out).toEqual({ 'parte-2': '1', 'otro-1': '2', 'parte-3': '1' });
		expect(JSON.stringify(out)).not.toContain('taller-oculto');
	});
});

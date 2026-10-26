import { describe, expect, it } from 'vitest';
import tagsFactory from '$lib/utils/tags';
import { SERIES_PARENT } from '$lib/utils/series.js';
import { seriesSitemapPosts } from './series.js';

/** Árbol chico, inventado (tagsFactory modifica los objetos: uno nuevo por prueba). */
const tree = () =>
	tagsFactory(
		/** @type {any} */ ([
			{ id: 'root', children: ['calendario'] },
			{ id: 'calendario', children: [SERIES_PARENT] },
			{ id: SERIES_PARENT, children: ['Serie Inventada', 'Serie Vacia', 'Serie Con Entrada'] }
		])
	);

/** @param {string} slug @param {string[]} tags @param {Record<string, any>} [meta] */
const event = (slug, tags, meta = {}) => ({
	path: `/calendario/${slug}`,
	meta: {
		category: 'calendario',
		postID: slug,
		start: '2031-08-01T20:00-03:00',
		tags,
		...meta
	}
});

describe('seriesSitemapPosts', () => {
	it('solo las series con ediciones en la lista pública, con la fecha más nueva', () => {
		const posts = [
			event('edicion-1', ['Serie Inventada'], { published_date: '2031-01-02Z-03:00' }),
			event('edicion-2', ['Serie Inventada'], { updated_date: '2031-03-04Z-03:00' }),
			event('otra', ['Serie Con Entrada'])
		];
		const out = seriesSitemapPosts(tree(), posts, ['/wiki/Serie-Con-Entrada']);
		expect(out).toEqual([
			{
				path: '/wiki/Serie-Inventada',
				meta: { updated_date: '2031-03-04T03:00:00.000Z' }
			}
		]);
	});

	it('una serie cuyas ediciones no están en la lista (privadas, ocultas) no va', () => {
		// Lo que no ve cualquiera no llega a `posts` (sitePosts sin sesión): sin ediciones, sin URL.
		expect(seriesSitemapPosts(tree(), [])).toEqual([]);
		// Un perfil o un material con la etiqueta no es una edición.
		const notEvents = [
			{ path: '/material/x', meta: { category: 'material', postID: 'x', tags: ['Serie Vacia'] } }
		];
		expect(seriesSitemapPosts(tree(), notEvents)).toEqual([]);
	});

	it('sin fechas de publicación, sin lastmod', () => {
		expect(seriesSitemapPosts(tree(), [event('e', ['Serie Vacia'])])).toEqual([
			{ path: '/wiki/Serie-Vacia', meta: {} }
		]);
	});
});

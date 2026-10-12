/**
 * /wiki/<término>: las publicaciones relacionadas van de a 20 con «Ver más», como el inicio
 * (decisión de gorrite, opción 2a de docs/seo.md). Los datos llegan enteros del servidor: con una
 * búsqueda (etiqueta o texto) se filtra la lista entera, así que aparece también lo que estaba
 * después del puesto 20. Render del servidor, datos inventados.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/wiki/bondage'),
		params: { term: 'bondage' },
		data: { wiki: [] }
	})
}));

const { default: Page } = await import('./+page.svelte');
const { filteredTags, searchText } = await import('$lib/utils/stores');

/** @param {number} i */
const post = (i) => ({
	path: `/material/nota-${i}`,
	meta: {
		title: `Nota inventada ${i}`,
		summary: '',
		tags: i == 27 ? ['bondage', 'etiqueta solo de la 27'] : ['bondage'],
		category: 'material',
		layout: 'material',
		postID: `nota-${i}`
	}
});
const relatedPosts = Array.from({ length: 30 }, (_, i) => post(i));

const rendered = () =>
	render(Page, {
		props: {
			data: /** @type {any} */ ({
				meta: { title: 'Bondage', wiki: 'bondage', postID: 'bondage', category: 'wiki' },
				path: '/wiki/bondage',
				relatedPosts,
				relatedPastCount: 0
			})
		}
	}).body;
/** @param {string} html */
const keys = (html) => [...html.matchAll(/data-key="([^"]+)"/g)].map((m) => m[1]);

afterEach(() => {
	filteredTags.set([]);
	searchText.set('');
});

describe('wiki: publicaciones relacionadas de a 20', () => {
	it('muestra las primeras 20 y «Ver más» con las que faltan', () => {
		const html = rendered();
		expect(keys(html)).toHaveLength(20);
		expect(keys(html)).not.toContain('/material/nota-27');
		expect(html).toContain('Ver más (10)');
		expect(html).toContain('30 resultados');
	});

	it('un filtro por etiqueta busca en la lista entera: aparece la del puesto 28', () => {
		filteredTags.set(['etiqueta solo de la 27']);
		const html = rendered();
		expect(keys(html)).toEqual(['/material/nota-27']);
		expect(html).not.toContain('Ver más');
	});

	it('la búsqueda por texto también', () => {
		searchText.set('inventada 27');
		const html = rendered();
		expect(keys(html)).toEqual(['/material/nota-27']);
		expect(html).not.toContain('Ver más');
	});
});

/**
 * PostList con `limit` (el feed del inicio): sin búsqueda muestra los primeros y «Ver más (N)»;
 * sin `limit`, todos. Y Card muestra la fecha corta de los eventos. Render del servidor, datos
 * inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';
import { render } from 'svelte/server';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/'), data: {} })
}));

const { default: PostList } = await import('./PostList.svelte');
const { default: Card } = await import('./Card.svelte');

/** @param {number} i */
const post = (i) => ({
	path: `/material/nota-${i}`,
	meta: {
		title: `Nota inventada ${i}`,
		summary: '',
		tags: [],
		category: 'material',
		layout: 'material',
		postID: `nota-${i}`
	}
});
const posts = Array.from({ length: 30 }, (_, i) => post(i));
/** @param {string} html */
const items = (html) => (html.match(/data-key="/g) ?? []).length;

describe('PostList limit', () => {
	it('muestra los primeros 20 y «Ver más» con los que faltan', () => {
		const html = render(PostList, { props: /** @type {any} */ ({ posts, limit: 20 }) }).body;
		expect(items(html)).toBe(20);
		expect(html).toContain('Ver más (10)');
		// el total sigue diciendo todos
		expect(html).toContain('30');
	});

	it('sin limit, todos y sin «Ver más»', () => {
		const html = render(PostList, { props: /** @type {any} */ ({ posts }) }).body;
		expect(items(html)).toBe(30);
		expect(html).not.toContain('Ver más');
	});

	it('amountLabel cambia lo que dice arriba de los resultados', () => {
		const html = render(PostList, {
			props: /** @type {any} */ ({
				posts,
				amountLabel: (/** @type {number} */ n) => `Octubre · ${n} eventos`
			})
		}).body;
		expect(html).toContain('Octubre · 30 eventos');
	});
});

describe('Card', () => {
	it('un evento muestra su fecha corta («vie 2 oct · 22:00»)', () => {
		const html = render(Card, {
			props: /** @type {any} */ ({
				post: {
					path: '/calendario/evento-inventado',
					meta: {
						title: 'Evento inventado',
						tags: [],
						category: 'calendario',
						start: '2099-10-02T22:00-03:00'
					}
				}
			})
		}).body;
		expect(html).toMatch(/<time class="card-date[^"]*"[^>]*>vie 2 oct 2099 · 22:00<\/time>/);
	});
});

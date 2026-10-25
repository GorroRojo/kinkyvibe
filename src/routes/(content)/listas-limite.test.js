/**
 * Las listas largas (/todo, /material, /amigues) muestran de a 24 tarjetas con «Ver más (N)», como
 * el inicio: con las casi 100 tarjetas y cientos de etiquetas juntas la página tardaba en responder
 * al cargar. Con una búsqueda (etiquetas elegidas) se ve todo lo que encontró, como siempre. En
 * /amigues los perfiles fijados siguen primero. Render del servidor, datos inventados.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/todo'), params: {}, data: {} })
}));

const { filteredTags } = await import('$lib/utils/stores');
/** @type {Record<'todo' | 'material' | 'amigues', any>} */
const pages = {
	todo: (await import('./todo/+page.svelte')).default,
	material: (await import('./material/+page.svelte')).default,
	amigues: (await import('./amigues/+page.svelte')).default
};

const TOTAL = 40;
/** @param {'material' | 'amigues'} layout @param {number} i @param {string} [id] */
const post = (layout, i, id = `inventade-${i}`) => ({
	path: `/${layout}/${id}`,
	meta: {
		title: `Publicación inventada ${i}`,
		summary: '',
		tags: [i % 2 ? 'impar inventada' : 'par inventada'],
		category: layout,
		layout,
		postID: id
	}
});
/** @param {'material' | 'amigues'} layout */
const posts = (layout) => Array.from({ length: TOTAL }, (_, i) => post(layout, i));

/** @param {keyof typeof pages} name @param {any[]} list */
const body = (name, list) =>
	render(pages[name], { props: { data: /** @type {any} */ ({ posts: list, wiki: [] }) } }).body;
/** Los `data-key` de las tarjetas, en orden. @param {string} html */
const keys = (html) => [...html.matchAll(/<li data-key="([^"]+)"/g)].map((m) => m[1]);

afterEach(() => filteredTags.set([]));

describe('listas largas de a 24', () => {
	for (const [name, layout] of /** @type {const} */ ([
		['todo', 'material'],
		['material', 'material'],
		['amigues', 'amigues']
	])) {
		it(`/${name}: 24 tarjetas y «Ver más (${TOTAL - 24})»`, () => {
			const html = body(name, posts(layout));
			expect(keys(html)).toHaveLength(24);
			expect(html).toContain(`Ver más (${TOTAL - 24})`);
		});

		it(`/${name}: con etiquetas elegidas se ve todo lo que encontró`, () => {
			filteredTags.set(['par inventada']);
			const html = body(name, posts(layout));
			expect(keys(html)).toHaveLength(TOTAL / 2);
			expect(html).not.toContain('Ver más');
		});
	}

	it('/amigues: los perfiles fijados van primero aunque vengan al final', () => {
		const list = [
			...posts('amigues'),
			post('amigues', 98, 'KinkyVibe'),
			post('amigues', 99, 'DemonWeb')
		];
		const shown = keys(body('amigues', list));
		expect(shown).toHaveLength(24);
		expect(shown.slice(0, 2)).toEqual(['/amigues/DemonWeb', '/amigues/KinkyVibe']);
	});
});

/**
 * CardRow con `eager`: las primeras N tarjetas piden su imagen enseguida y la primera con
 * prioridad (es el LCP del inicio, docs/seo.md «Velocidad»); las demás siguen `lazy`. Render del
 * servidor, datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CardRow from './CardRow.svelte';

/** @param {number} i */
const post = (i) => ({
	path: `/material/nota-${i}`,
	meta: {
		title: `Nota inventada ${i}`,
		tags: [],
		category: 'material',
		featured: `/media/img/inventada-${i}.webp`
	}
});
const items = Array.from({ length: 6 }, (_, i) => post(i));
/** @param {string} html */
const imgs = (html) => html.match(/<img[^>]*>/g) ?? [];

describe('CardRow eager', () => {
	it('carga enseguida las primeras N y solo la primera con prioridad', () => {
		const tags = imgs(render(CardRow, { props: { items, eager: 4 } }).body);
		expect(tags).toHaveLength(6);
		expect(tags.map((t) => t.match(/loading="(\w+)"/)?.[1])).toEqual([
			'eager',
			'eager',
			'eager',
			'eager',
			'lazy',
			'lazy'
		]);
		expect(tags.filter((t) => t.includes('fetchpriority="high"'))).toHaveLength(1);
		expect(tags[0]).toContain('fetchpriority="high"');
	});

	it('sin `eager`, todas `lazy` y ninguna con prioridad', () => {
		const tags = imgs(render(CardRow, { props: { items } }).body);
		expect(tags.every((t) => t.includes('loading="lazy"'))).toBe(true);
		expect(tags.some((t) => t.includes('fetchpriority'))).toBe(false);
	});
});

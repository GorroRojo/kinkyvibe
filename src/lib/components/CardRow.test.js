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
		featured: `/media/img/${String(i).repeat(64)}.webp`
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

describe('CardRow: la imagen de las tarjetas', () => {
	it('cada tarjeta con la copia de 360 px (1x) y la de 720 px (2x); `src` sigue siendo el original', () => {
		const tags = imgs(render(CardRow, { props: { items } }).body);
		const h = '0'.repeat(64);
		expect(tags[0]).toContain(`src="/media/img/${h}.webp"`);
		expect(tags[0]).toContain(`srcset="/media/img/${h}-360.webp 1x, /media/img/${h}-720.webp 2x"`);
	});

	it('sin copias (una imagen que no es de la biblioteca): solo `src`', () => {
		const other = [{ ...post(0), meta: { ...post(0).meta, featured: '/favicon.png' } }];
		const [tag] = imgs(render(CardRow, { props: { items: other } }).body);
		expect(tag).toContain('src="/favicon.png"');
		expect(tag).not.toContain('srcset');
	});

	it('la prioridad va a la primera tarjeta CON imagen (el LCP), aunque esté después de las `eager`', () => {
		const noCover = (/** @type {number} */ i) => ({
			...post(i),
			meta: { ...post(i).meta, featured: undefined }
		});
		const list = [noCover(0), noCover(1), noCover(2), post(3), post(4)];
		const tags = imgs(render(CardRow, { props: { items: list, eager: 2 } }).body);
		// Las tarjetas sin imagen no tienen <img> (llevan el ícono del tipo, Card.svelte): quedan
		// las dos con imagen, la 4.ª y la 5.ª de la fila.
		expect(tags).toHaveLength(2);
		expect(tags.map((t) => t.includes('fetchpriority="high"'))).toEqual([true, false]);
		expect(tags[0]).toContain('loading="eager"');
		expect(tags[1]).toContain('loading="lazy"');
	});
});

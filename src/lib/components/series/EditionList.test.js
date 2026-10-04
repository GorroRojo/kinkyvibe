/**
 * EditionList con `visible`: las primeras a la vista y las demás plegadas en «Ver las N
 * anteriores» (la página de una serie larga). Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import EditionList from './EditionList.svelte';

const editions = Array.from({ length: 8 }, (_, i) => ({
	slug: `serie-inventada-${i}`,
	number: 8 - i,
	title: `Serie inventada #${8 - i}`,
	path: `/calendario/serie-inventada-${i}`,
	start: `2026-0${(i % 9) + 1}-01T20:00-03:00`,
	status: 'abierto'
}));
/** @param {string} html */
const visibleItems = (html) => (html.split('<details')[0].match(/<li/g) ?? []).length;

describe('EditionList', () => {
	it('con visible=5: 5 a la vista y 3 plegadas', () => {
		const html = render(EditionList, { props: /** @type {any} */ ({ editions, visible: 5 }) }).body;
		expect(visibleItems(html)).toBe(5);
		expect(html).toContain('<details');
		expect(html).toContain('Ver las 3 anteriores');
		expect((html.match(/<li/g) ?? []).length).toBe(8);
	});

	it('sin visible, todas y sin plegar', () => {
		const html = render(EditionList, { props: /** @type {any} */ ({ editions }) }).body;
		expect(visibleItems(html)).toBe(8);
		expect(html).not.toContain('<details');
	});
});

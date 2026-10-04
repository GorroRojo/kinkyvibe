/**
 * Las series en la Kinkipedia, render del servidor: una tarjeta por serie con su ícono, imagen o
 * emoji, descripción, ediciones y la próxima (o la última); las series hijas, dentro de la tarjeta
 * de su madre. Datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SeriesGrid from './SeriesGrid.svelte';

const base = { description: '', image: undefined, next: null, last: null, parent: null };
const series = [
	{
		...base,
		id: 'Serie Madre',
		name: 'Serie Madre',
		icon: '🌶',
		href: '/wiki/Serie-Madre',
		image: '/assets/madre.webp',
		description: 'Una serie inventada.',
		total: 9,
		next: { title: 'Serie Madre 10', start: '2026-11-07T22:00-03:00', path: '/calendario/madre-10' }
	},
	{
		...base,
		id: 'Serie Madre 2026',
		name: 'Serie Madre 2026',
		icon: '📅',
		href: '/wiki/Serie-Madre-2026',
		total: 3,
		parent: 'Serie Madre'
	},
	{
		...base,
		id: 'Serie Suelta',
		name: 'Serie Suelta',
		icon: '🎈',
		href: '/wiki/Serie-Suelta',
		total: 1,
		last: { start: '2025-06-19T20:00-03:00' }
	},
	{
		...base,
		id: 'Hija Sin Madre',
		name: 'Hija Sin Madre',
		icon: '',
		href: '/wiki/Hija-Sin-Madre',
		total: 2,
		parent: 'Madre Sin Ediciones'
	}
];

const html = () => render(SeriesGrid, { props: { series } }).body;

describe('SeriesGrid', () => {
	it('una tarjeta por serie de arriba; las hijas van dentro de su madre', () => {
		const body = html();
		const cards = body.match(/class="surface-card[^"]*"/g) ?? [];
		expect(cards).toHaveLength(3);
		expect(body).toContain('aria-label="Series dentro de Serie Madre"');
		const madre = body.indexOf('href="/wiki/Serie-Madre"');
		const hija = body.indexOf('href="/wiki/Serie-Madre-2026"');
		const suelta = body.indexOf('href="/wiki/Serie-Suelta"');
		expect(madre).toBeGreaterThan(-1);
		expect(hija).toBeGreaterThan(madre);
		expect(suelta).toBeGreaterThan(hija);
	});

	it('imagen o emoji, descripción, ediciones y la próxima (o la última)', () => {
		const body = html();
		expect(body).toContain('src="/assets/madre.webp"');
		expect(body).toContain('Una serie inventada.');
		expect(body).toContain('9 ediciones');
		expect(body).toContain('href="/calendario/madre-10"');
		expect(body).toContain('1 edición');
		expect(body).toMatch(/Última: 19 jun\.? 2025/);
		// Sin imagen: el emoji grande (y uno por defecto si no tiene).
		expect(body).toContain('class="cover-emoji');
		expect(body).toContain('🔁');
	});

	it('una hija cuya madre no tiene ediciones queda suelta', () => {
		expect(html()).toContain('href="/wiki/Hija-Sin-Madre"');
		expect(html()).not.toContain('Series dentro de Madre Sin Ediciones');
	});
});

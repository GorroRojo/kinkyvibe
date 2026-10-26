/**
 * Card sin imagen: el ícono grande del tipo sobre el degradé (docs/estilo.md, «Tarjetas») en vez de
 * un <img> sin src. Render del servidor, datos inventados.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Card from './Card.svelte';
import { cardTypeIcon } from '$lib/utils/cardIcon.js';
import { BookOpen, CalendarDays, User } from '@lucide/svelte';

/** @param {Record<string, unknown>} meta */
const card = (meta) =>
	render(Card, {
		props: {
			post: {
				path: '/calendario/evento-inventado',
				meta: { title: 'Evento inventado', tags: [], category: 'calendario', ...meta }
			}
		}
	}).body;

describe('Card', () => {
	it('con imagen: el <img> de siempre, sin ícono', () => {
		const html = card({ featured: `/media/img/${'0'.repeat(64)}.webp` });
		expect(html).toMatch(/<img[^>]*class="card-img u-featured/);
		expect(html).not.toContain('card-img placeholder');
	});

	it('sin imagen: el ícono del tipo, oculto para lectores de pantalla, y ningún <img>', () => {
		for (const featured of [undefined, '', 'undefined']) {
			const html = card({ featured });
			expect(html).not.toMatch(/<img/);
			expect(html).toMatch(
				/<div class="card-img placeholder[^"]*" aria-hidden="true">(<!--[^>]*-->)*<svg[^>]*lucide-calendar-days/
			);
		}
	});
});

describe('cardTypeIcon', () => {
	it('el ícono de typeIcon según la categoría', () => {
		expect(cardTypeIcon({ category: 'calendario' })).toBe(CalendarDays);
		expect(cardTypeIcon({ category: 'material' })).toBe(BookOpen);
		expect(cardTypeIcon({ category: 'amigues' })).toBe(User);
		expect(cardTypeIcon({ category: 'wiki' })).toBe(BookOpen);
		expect(cardTypeIcon(undefined)).toBe(BookOpen);
	});
});

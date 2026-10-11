/**
 * La página de un material muestra «X min de lectura» junto a la fecha (idea de JorgeT10, PR #46);
 * sin minutos (texto corto), nada. Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { stripHtmlTags } from '$lib/utils/htmlStrip.js';

vi.mock('$app/stores', () => ({
	page: readable({
		url: new URL('http://localhost/material/guia-inventada'),
		params: { post: 'guia-inventada' }
	})
}));

const { default: Page } = await import('./+page.svelte');

/**
 * @param {Record<string, any>} [extra]
 * @param {Record<string, any>} [meta]
 */
const rendered = (extra = {}, meta = {}) =>
	render(Page, {
		props: {
			data: /** @type {any} */ ({
				meta: {
					title: 'Guía Inventada',
					postID: 'guia-inventada',
					category: 'material',
					published_date: '2030-03-01T00:00:00-03:00',
					authors: ['Persona Inventada'],
					tags: [],
					...meta
				},
				path: '/material/guia-inventada',
				html: '<p>Texto inventado.</p>',
				css: '',
				parts: null,
				authorsProfiles: [],
				relatedPosts: [],
				relatedPastCount: 0,
				pronouns: {},
				personas: null,
				...extra
			})
		}
	}).body;

describe('material: tiempo de lectura', () => {
	it('junto a les autores y la fecha', () => {
		const html = rendered({ readingMinutes: 7 });
		const address = /<address[^>]*>([\s\S]*?)<\/address>/.exec(html)?.[1] ?? '';
		const text = stripHtmlTags(address).replace(/\s+/g, ' ');
		expect(text).toContain('Persona Inventada');
		expect(text).toContain('7 min de lectura');
		// La explicación, unida al botón (se abre al tocar; mouse y foco, por CSS): ReadingTime.svelte.
		expect(address).toMatch(
			/<button[^>]*aria-expanded="false"[^>]*aria-describedby="kv-tiempo-de-lectura"/
		);
		expect(address).toMatch(
			/<span(?=[^>]*\bid="kv-tiempo-de-lectura")(?=[^>]*\brole="note")[^>]*>Calculado a unas 200 palabras por minuto, sin contar imágenes ni código<\/span>/
		);
		// El reloj (Lucide, como los de «Cuándo y dónde»), antes del texto y oculto a los lectores.
		expect(address).toMatch(
			/<svg[^>]*class="[^"]*lucide-clock[^"]*"[^>]*aria-hidden="true"[\s\S]*?<\/svg>[\s\S]*?7 min de lectura/
		);
		// En la explicación, el link para ajustar la velocidad de cada persona.
		expect(address).toContain('¿Leés más rápido o más lento? Ajustalo');
	});

	it('sin autores, solo el tiempo de lectura', () => {
		const html = rendered({ readingMinutes: 2 }, { authors: [] });
		expect(stripHtmlTags(html)).toContain('2 min de lectura');
	});

	it('texto corto (0) o sin dato: no se muestra', () => {
		expect(rendered({ readingMinutes: 0 })).not.toContain('min de lectura');
		expect(rendered()).not.toContain('min de lectura');
	});
});

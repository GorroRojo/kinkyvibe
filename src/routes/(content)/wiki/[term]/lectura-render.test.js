/**
 * La página de la wiki muestra «X min de lectura» debajo del título (idea de JorgeT10, PR #46);
 * sin minutos (texto corto) o sin texto de la wiki, nada. Datos inventados.
 */
import { describe, expect, it, vi } from 'vitest';
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

/** @param {Record<string, any>} [extra] */
const rendered = (extra = {}) =>
	render(Page, {
		props: {
			data: /** @type {any} */ ({
				meta: { title: 'Bondage', wiki: 'bondage', postID: 'bondage', category: 'wiki' },
				path: '/wiki/bondage',
				html: '<p>Un texto inventado de la wiki.</p>',
				css: '',
				parts: null,
				relatedPosts: [],
				relatedPastCount: 0,
				...extra
			})
		}
	}).body;

describe('wiki: tiempo de lectura', () => {
	it('debajo del título, antes del texto', () => {
		const html = rendered({ readingMinutes: 3 });
		const label = html.indexOf('3 min de lectura');
		expect(label).toBeGreaterThan(-1);
		expect(label).toBeLessThan(html.indexOf('Un texto inventado de la wiki.'));
		expect(html).toMatch(
			/<button[^>]*aria-expanded="false"[^>]*aria-describedby="kv-tiempo-de-lectura"/
		);
		expect(html).toMatch(
			/<span(?=[^>]*\bid="kv-tiempo-de-lectura")(?=[^>]*\brole="note")[^>]*>Calculado a unas 200 palabras por minuto, sin contar imágenes ni código<\/span>/
		);
		expect(html).toMatch(
			/<svg[^>]*class="[^"]*lucide-clock[^"]*"[^>]*aria-hidden="true"[\s\S]*?<\/svg>[\s\S]*?3 min de lectura/
		);
		// En la explicación, el link para ajustar la velocidad de cada persona.
		expect(html).toContain('¿Leés más rápido o más lento? Ajustalo');
	});

	it('texto corto (0), sin dato o sin texto de la wiki: no se muestra', () => {
		expect(rendered({ readingMinutes: 0 })).not.toContain('min de lectura');
		expect(rendered()).not.toContain('min de lectura');
		expect(rendered({ readingMinutes: 3, html: undefined })).not.toContain('min de lectura');
	});
});

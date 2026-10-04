/**
 * Menú del sitio: en el celu el buscador es un ítem más de la barra de abajo (antes era un botón
 * flotante que tapaba texto, errores de formularios y botones). Revisión de UX del sitio.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { BookOpen } from '@lucide/svelte';
import { stripHtmlTags } from '$lib/utils/htmlStrip.js';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/material') })
}));

const { default: Navbar } = await import('./Navbar.svelte');

describe('Navbar', () => {
	const body = render(Navbar, {
		props: { links: [{ icon: BookOpen, name: 'Material', sub: 'Textos', href: '/material' }] }
	}).body;

	it('el buscador es un ítem de la lista, con su texto «Buscar»', () => {
		const item = body.match(/<li class="search-item[^"]*"[^>]*>[\s\S]*?<\/li>/)?.[0] ?? '';
		expect(item).toMatch(/<button[^>]*type="button"[^>]*aria-haspopup="dialog"/);
		expect(stripHtmlTags(item).trim()).toBe('Buscar');
		// dentro de la barra, no flotando aparte
		expect(body.indexOf('search-item')).toBeLessThan(body.indexOf('</ul>'));
	});

	it('ya no hay botón flotante', () => {
		expect(body).not.toContain('data-search-trigger="fab"');
		expect(body).not.toMatch(/class="[^"]*\bfab\b/);
	});
});

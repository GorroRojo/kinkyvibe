/**
 * Menú del sitio: en el celu el buscador es el botón flotante de abajo a la derecha, no un ítem de
 * la barra (decisión de gorrite, 4/10, después de ver las dos versiones en la revisión de UX).
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { readable } from 'svelte/store';
import { BookOpen } from '@lucide/svelte';

vi.mock('$app/stores', () => ({
	page: readable({ url: new URL('http://localhost/material') })
}));

const { default: Navbar } = await import('./Navbar.svelte');

describe('Navbar', () => {
	const body = render(Navbar, {
		props: { links: [{ icon: BookOpen, name: 'Material', sub: 'Textos', href: '/material' }] }
	}).body;

	it('el buscador es el botón flotante, que abre el diálogo', () => {
		expect(body).toMatch(/<button[^>]*data-search-trigger="fab"[^>]*aria-haspopup="dialog"/);
	});

	it('la barra no tiene un ítem «Buscar»', () => {
		expect(body).not.toContain('search-item');
	});
});

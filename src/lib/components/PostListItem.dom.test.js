// @vitest-environment jsdom
/**
 * La tarjeta de un evento en la lista, en el navegador (jsdom + @testing-library/svelte): ya no
 * tiene «Añadir al calendario» (gorrite, 25/10), así que ni al montar ni al tocarla se baja la
 * librería del menú (add-to-calendar-button, ~60 KB comprimida).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';

const loaded = vi.fn();
vi.mock('add-to-calendar-button', () => {
	loaded();
	return { atcb_action: vi.fn() };
});

const { default: PostListItem } = await import('./PostListItem.svelte');

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

const post = {
	path: '/calendario/evento-inventado',
	meta: {
		title: 'Taller inventado',
		summary: 'Un evento de prueba.',
		tags: [],
		category: 'calendario',
		layout: 'calendario',
		postID: 'evento-inventado',
		status: 'abierto',
		start: '2099-12-01T20:00-03:00',
		end: '2099-12-01T22:00-03:00',
		link: 'https://example.com/inscripcion'
	}
};

describe('PostListItem: sin «Añadir al calendario»', () => {
	it('un evento abierto con link: sin el botón, y la librería no se baja', async () => {
		const { queryByRole, getByRole, container } = render(PostListItem, { props: { post } });
		await tick();
		expect(queryByRole('button', { name: 'Añadir al calendario' })).toBeNull();
		expect(container.querySelector('.add-cal')).toBeNull();
		// la inscripción externa sigue (se arma al montar)
		expect(getByRole('link', { name: 'INSCRIPCIÓN' }).getAttribute('href')).toBe(
			'https://example.com/inscripcion'
		);
		expect(loaded).not.toHaveBeenCalled();
	});
});

// @vitest-environment jsdom
/**
 * La tarjeta de un evento en la lista, en el navegador (jsdom + @testing-library/svelte): ya no
 * tiene «Añadir al calendario» (gorrite, 25/10). La librería del menú se sacó del proyecto.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import PostListItem from './PostListItem.svelte';

afterEach(() => {
	cleanup();
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
	it('un evento abierto con link: sin el botón', async () => {
		const { queryByRole, getByRole } = render(PostListItem, { props: { post } });
		await tick();
		expect(queryByRole('button', { name: 'Añadir al calendario' })).toBeNull();
		// la inscripción externa sigue (se arma al montar)
		expect(getByRole('link', { name: 'INSCRIPCIÓN' }).getAttribute('href')).toBe(
			'https://example.com/inscripcion'
		);
	});
});

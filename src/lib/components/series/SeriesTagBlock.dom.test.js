// @vitest-environment jsdom
/**
 * Lo de series y «Seguir» en el navegador: si la página ya lo trajo con la carga (`info`, también
 * `null`), no se pide nada al montar; si no lo trajo (la página de un evento), se pide como antes.
 * Datos inventados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import SeriesTagBlock from './SeriesTagBlock.svelte';
import FollowButton from '../FollowButton.svelte';

/** @type {import('vitest').Mock} */
let fetchSpy;
beforeEach(() => {
	fetchSpy = vi.fn(async () => new Response('{"member":false}', { status: 200 }));
	vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const seriesInfo = {
	series: null,
	feed: '/wiki/Etiqueta-Inventada/calendario.ics',
	account: { member: false, subscribed: false, sigo: false, invite: false }
};

describe('sin pedir nada al montar cuando la página ya lo trajo', () => {
	it('SeriesTagBlock: el bloque está desde el principio y no hay fetch', async () => {
		const { container } = render(SeriesTagBlock, {
			props: { tag: 'Etiqueta Inventada', info: seriesInfo }
		});
		expect(container.querySelector('.series-block')).not.toBeNull();
		await tick();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('SeriesTagBlock con `null`: nada, y tampoco fetch', async () => {
		const { container } = render(SeriesTagBlock, {
			props: { tag: 'Etiqueta Inventada', info: null }
		});
		await tick();
		expect(container.querySelector('.series-block')).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('FollowButton sin sesión: el botón está desde el principio y no hay fetch', async () => {
		const { getByText } = render(FollowButton, {
			props: { kind: 'etiqueta', key: 'Etiqueta Inventada', info: { member: false } }
		});
		expect(getByText('Seguir')).toBeTruthy();
		await tick();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('FollowButton con `null`: nada, y tampoco fetch', async () => {
		const { container } = render(FollowButton, {
			props: { kind: 'etiqueta', key: 'Etiqueta Inventada', info: null }
		});
		await tick();
		expect(container.querySelector('.follow')).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});

describe('sin lo de la página (p. ej. la de un evento): se pide como antes', () => {
	it('FollowButton pregunta a /api/sigo', async () => {
		render(FollowButton, { props: { kind: 'etiqueta', key: 'Etiqueta Inventada' } });
		await tick();
		expect(fetchSpy).toHaveBeenCalledWith('/api/sigo?tipo=etiqueta&clave=Etiqueta+Inventada');
	});

	it('SeriesTagBlock pide /api/series/<etiqueta>', async () => {
		render(SeriesTagBlock, { props: { tag: 'Etiqueta Inventada' } });
		await tick();
		expect(fetchSpy).toHaveBeenCalledWith('/api/series/Etiqueta-Inventada');
	});
});

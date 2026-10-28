// @vitest-environment jsdom
/**
 * El botón flotante de buscar se esconde al bajar y vuelve al subir, nunca con el foco adentro, y
 * sigue en el orden de tabulación aunque esté escondido. El de la cabecera no se esconde.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import SearchButton from './SearchButton.svelte';

/** Lleva el scroll a `y` y deja correr el cuadro de animación. @param {number} y */
async function scrollTo(y) {
	Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
	window.dispatchEvent(new Event('scroll'));
	await Promise.resolve();
	await tick();
}

beforeEach(() => {
	// jsdom no dibuja cuadros: el pedido corre en la próxima microtarea (después de devolver el
	// id, como un cuadro de verdad).
	vi.stubGlobal('requestAnimationFrame', (/** @type {FrameRequestCallback} */ fn) => {
		queueMicrotask(() => fn(0));
		return 1;
	});
	vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

describe('SearchButton fab y el scroll', () => {
	it('se va al bajar, vuelve al subir y cerca de arriba', async () => {
		const { container } = render(SearchButton, { props: { variant: 'fab' } });
		const btn = /** @type {HTMLButtonElement} */ (container.querySelector('button'));
		await scrollTo(400);
		expect(btn.classList.contains('away')).toBe(true);
		await scrollTo(300);
		expect(btn.classList.contains('away')).toBe(false);
		await scrollTo(600);
		expect(btn.classList.contains('away')).toBe(true);
		await scrollTo(20);
		expect(btn.classList.contains('away')).toBe(false);
	});

	it('con el foco adentro no se esconde, y escondido se puede enfocar con Tab', async () => {
		const { container } = render(SearchButton, { props: { variant: 'fab' } });
		const btn = /** @type {HTMLButtonElement} */ (container.querySelector('button'));
		await scrollTo(500);
		expect(btn.classList.contains('away')).toBe(true);
		// sin tabindex negativo ni inert ni aria-hidden: sigue en el orden de tabulación
		expect(btn.tabIndex).toBe(0);
		expect(btn.hasAttribute('inert') || btn.getAttribute('aria-hidden') === 'true').toBe(false);
		btn.focus();
		await tick();
		expect(btn.classList.contains('away')).toBe(false);
		await scrollTo(900);
		expect(btn.classList.contains('away')).toBe(false);
		btn.blur();
		await tick();
		expect(btn.classList.contains('away')).toBe(true);
	});

	it('el botón de la cabecera no escucha el scroll', async () => {
		const { container } = render(SearchButton, { props: { variant: 'icon' } });
		await scrollTo(800);
		expect(container.querySelector('button')?.classList.contains('away')).toBe(false);
	});
});

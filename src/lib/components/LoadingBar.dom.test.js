// @vitest-environment jsdom
/**
 * La barrita de carga del sitio: aparece solo si la navegación tarda más de 150 ms, se va cuando
 * llega la página y una navegación rápida no la muestra nunca.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';

/** @type {import('svelte/store').Writable<any>} */
const navigating = writable(null);
vi.mock('$app/stores', () => ({ navigating }));

const { default: LoadingBar } = await import('./LoadingBar.svelte');

/** Una navegación en curso, como la da SvelteKit. */
const NAV = {
	from: { url: new URL('https://sitio.test/') },
	to: { url: new URL('https://sitio.test/calendario') },
	type: 'link'
};

beforeEach(() => {
	vi.useFakeTimers();
	navigating.set(null);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

/** @param {number} ms */
async function wait(ms) {
	vi.advanceTimersByTime(ms);
	await tick();
}

describe('LoadingBar', () => {
	it('sin navegación, no está', async () => {
		const { queryByRole } = render(LoadingBar);
		await wait(1000);
		expect(queryByRole('progressbar')).toBeNull();
	});

	it('aparece después de 150 ms navegando, con su nombre, y se va al llegar', async () => {
		const { queryByRole } = render(LoadingBar);
		navigating.set(NAV);
		await tick();
		await wait(149);
		expect(queryByRole('progressbar')).toBeNull();
		await wait(1);
		const bar = queryByRole('progressbar');
		expect(bar).not.toBeNull();
		expect(bar?.getAttribute('aria-label')).toBe('Cargando la página');
		navigating.set(null);
		await tick();
		expect(queryByRole('progressbar')).toBeNull();
	});

	it('una navegación rápida (menos de 150 ms) no la muestra', async () => {
		const { queryByRole } = render(LoadingBar);
		navigating.set(NAV);
		await tick();
		await wait(100);
		navigating.set(null);
		await wait(500);
		expect(queryByRole('progressbar')).toBeNull();
	});

	it('si la navegación sigue en otra (redirección), no vuelve a esperar', async () => {
		const { queryByRole } = render(LoadingBar);
		navigating.set(NAV);
		await tick();
		await wait(150);
		navigating.set({ ...NAV, type: 'goto' });
		await tick();
		expect(queryByRole('progressbar')).not.toBeNull();
	});
});

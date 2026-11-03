// @vitest-environment jsdom
/**
 * «¿Cómo buscar?» del buscador del sitio, montado: el párrafo y cada línea (cómo se escribe, qué
 * hace y el ejemplo) son los de searchSyntax.js (`SEARCH_GUIDE_TEXT.sitio`, `searchHelp('sitio')`),
 * la fuente única de las guías del sitio, el bot y el panel (ver src/lib/utils/searchGuide.test.js).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { searchOpen } from '$lib/utils/stores';
import { SEARCH_GUIDE_TEXT, searchHelp } from '$lib/utils/searchSyntax.js';
import SearchPalette from './SearchPalette.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn(), afterNavigate: vi.fn() }));

Element.prototype.scrollIntoView ??= () => {};
// Las transiciones de Svelte usan Web Animations, que jsdom no tiene.
Element.prototype.animate ??= /** @type {any} */ (
	function () {
		return { cancel() {}, finished: Promise.resolve(), onfinish: null };
	}
);

afterEach(() => {
	cleanup();
	searchOpen.set(false);
	vi.unstubAllGlobals();
});

describe('SearchPalette: «¿Cómo buscar?»', () => {
	it('muestra exactamente lo que arma el registro para el sitio', async () => {
		// El índice no hace falta para la guía: que no llegue.
		vi.stubGlobal('fetch', () => new Promise(() => {}));
		const { container } = render(SearchPalette);
		searchOpen.set(true);
		await tick();
		const toggle = /** @type {HTMLButtonElement} */ (container.querySelector('.help-toggle'));
		await fireEvent.click(toggle);
		await waitFor(() => expect(container.querySelector('.help')).not.toBeNull());
		const help = /** @type {HTMLElement} */ (container.querySelector('.help'));
		expect(help.querySelector('p')?.textContent?.trim()).toBe(SEARCH_GUIDE_TEXT.sitio.intro);
		const rows = [...help.querySelectorAll('.help-row')].map((row) => {
			const example = row.querySelector('button.example')?.textContent?.trim() ?? '';
			const dd = row.querySelector('dd')?.textContent ?? '';
			return {
				label: row.querySelector('dt')?.textContent?.trim(),
				help: dd.replace(example, '').trim(),
				example
			};
		});
		expect(rows).toEqual(
			searchHelp('sitio').map((r) => ({ label: r.label, help: r.help, example: r.example }))
		);
	});
});

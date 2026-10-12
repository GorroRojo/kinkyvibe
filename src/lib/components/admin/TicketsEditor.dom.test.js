// @vitest-environment jsdom
/**
 * «Entradas» del editor de eventos en el navegador (jsdom + @testing-library/svelte): pasar un
 * tipo a «Preventas» muestra sus tramos, «Sacar» saca un tipo sin ventas y, si tiene ventas, está
 * desactivado y explica por qué. También con un borrador recuperado de otra carga de la página
 * (gorrite, 12/10: ahí se repetían las keys del `{#each}` y el editor quedaba colgado).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/svelte';
import TicketsEditor from './TicketsEditor.svelte';
import { readTicketsForm } from '$lib/utils/ticketsEditor.js';

afterEach(cleanup);

const meta = {
	tickets: [
		{ id: 'general', name: 'General', price: 15000, capacity: 12 },
		{ id: 'segunda', name: 'Segunda tanda', price: 18000 }
	]
};
/** @type {import('$lib/utils/ticketsEditor.js').SalesByType} */
const sales = { general: { sold: 7, held: 0 } };

/** Las tarjetas de los tipos (`li.type`). */
const cards = () => /** @type {HTMLElement[]} */ ([...document.querySelectorAll('li.type')]);

/**
 * @param {Record<string, unknown>} [props]
 * @param {{ mount?: typeof render, Editor?: typeof TicketsEditor, read?: typeof readTicketsForm }}
 *   [mods] los módulos de otra carga de la página
 */
function setup(
	props = {},
	{ mount = render, Editor = TicketsEditor, read = readTicketsForm } = {}
) {
	const errors = /** @type {unknown[]} */ ([]);
	const onError = (/** @type {ErrorEvent} */ e) => errors.push(e.error ?? e.message);
	window.addEventListener('error', onError);
	const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));
	const r = mount(Editor, { props: { state: read(meta), sales, ...props } });
	return {
		...r,
		errors,
		done() {
			window.removeEventListener('error', onError);
			spy.mockRestore();
		}
	};
}

describe('TicketsEditor en el navegador', () => {
	it('pasar el segundo tipo a «Preventas» muestra sus tramos, sin errores', async () => {
		const t = setup();
		expect(cards()).toHaveLength(2);
		await fireEvent.click(within(cards()[1]).getByLabelText('Preventas'));
		const second = cards()[1];
		expect(within(second).getByText('Entrada 2')).toBeTruthy();
		expect(within(second).getByText(/Tramos de preventa/)).toBeTruthy();
		expect(within(second).getAllByLabelText('Nombre del tramo')).toHaveLength(2);
		expect(within(second).getByRole('button', { name: /Agregar tramo/ })).toBeTruthy();
		// El primero sigue como estaba.
		expect(
			/** @type {HTMLInputElement} */ (within(cards()[0]).getByLabelText('Precio fijo')).checked
		).toBe(true);
		t.done();
		expect(t.errors).toEqual([]);
	});

	it('«Sacar»: habilitado con 0 vendidas (y saca el tipo); con ventas, desactivado y explica por qué', async () => {
		const t = setup();
		const [first, second] = cards();
		const keep = within(first).getByRole('button', { name: 'Sacar' });
		expect(/** @type {HTMLButtonElement} */ (keep).disabled).toBe(true);
		const why = within(first).getByText(
			/no se puede sacar; podés cerrarla con el cupo o el cierre/
		);
		expect(keep.getAttribute('aria-describedby')).toBe(why.id);
		expect(keep.getAttribute('title')).toBe(why.textContent);

		const remove = within(second).getByRole('button', { name: 'Sacar' });
		expect(/** @type {HTMLButtonElement} */ (remove).disabled).toBe(false);
		expect(within(second).queryByText(/no se puede sacar/)).toBeNull();
		await fireEvent.click(remove);
		expect(cards()).toHaveLength(1);
		t.done();
		expect(t.errors).toEqual([]);
	});

	it('con un borrador recuperado de otra carga: agregar, sacar y pasar a «Preventas» funcionan', async () => {
		// Carga anterior (como PostEditor: el formulario inicial y el que se edita): se agregó un
		// tipo y se sacó el segundo; el borrador queda en JSON.
		vi.resetModules();
		const before = await import('$lib/utils/ticketsEditor.js');
		before.readTicketsForm(meta);
		const old = before.readTicketsForm(meta);
		old.types = [
			old.types[0],
			{ ...before.emptyTicketType(), name: 'Tanda nueva', price: '20000' }
		];
		const draft = JSON.parse(JSON.stringify(old));

		// Esta carga (los módulos se vuelven a evaluar, como al recargar la página; también Svelte y
		// testing-library, para que monten con el mismo runtime): el editor arranca con el archivo y
		// se recupera el borrador.
		vi.resetModules();
		const tl = await import('@testing-library/svelte');
		const { readTicketsForm: read } = await import('$lib/utils/ticketsEditor.js');
		const { default: Editor } = await import('./TicketsEditor.svelte');
		read(meta); // el formulario inicial de PostEditor
		const t = setup({}, { mount: tl.render, Editor, read });
		await t.rerender({ state: draft });
		expect(cards()).toHaveLength(2);
		await tl.fireEvent.click(tl.screen.getByRole('button', { name: /Agregar tipo de entrada/ }));
		expect(cards()).toHaveLength(3);
		const third = tl.within(cards()[2]);
		await tl.fireEvent.click(third.getByRole('button', { name: 'Sacar' }));
		expect(cards()).toHaveLength(2);
		await tl.fireEvent.click(tl.within(cards()[1]).getByLabelText('Preventas'));
		expect(tl.within(cards()[1]).getAllByLabelText('Nombre del tramo')).toHaveLength(2);
		tl.cleanup();
		t.done();
		expect(t.errors).toEqual([]);
	});
});

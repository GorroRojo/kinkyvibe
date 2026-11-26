// @vitest-environment jsdom
/**
 * Los campos de un tramo (nombre, precio, cantidad y «Hasta») llegan al editor de afuera, como
 * cualquier otro campo de «Entradas». Antes (26/11) cambiar solo la fecha de una preventa no
 * llegaba: «Guardar» seguía en «No hay cambios para guardar» y la fecha no se guardaba
 * (TicketTiersEditor.svelte). Fechas y precios inventados; las fechas «Hasta» ya pasaron, como en
 * un borrador duplicado de un evento viejo.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Parent from './TicketsEditorParent.test.svelte';

afterEach(cleanup);

const meta = {
	tickets: [
		{
			id: 'general',
			name: 'General',
			door_price: 20000,
			tiers: [
				{ id: 'preventa-1', name: 'Preventa 1', price: 14000, until: '2026-11-07T15:26-03:00' },
				{ id: 'preventa-2', name: 'Preventa 2', price: 16000, until: '2026-11-14T15:26-03:00' },
				{ id: 'general', name: 'General', price: 18000 }
			]
		}
	],
	puerta: true
};

/** @param {string} id */
const input = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

describe('TicketsEditor: los tramos avisan al padre', () => {
	for (const [field, value] of /** @type {const} */ ([
		['until', '2026-12-01T23:59'],
		['price', '15000'],
		['qty', '30'],
		['name', 'Preventa uno']
	])) {
		it(`cambiar «${field}» de un tramo cuenta como cambio`, async () => {
			render(Parent, { props: { meta } });
			const changed = screen.getByTestId('changed');
			expect(changed.textContent).toBe('sin cambios');
			const el = input(`edit-tier-0-${field}-0`);
			expect(el).toBeTruthy();
			await fireEvent.input(el, { target: { value } });
			expect(changed.textContent).toBe('con cambios');
		});
	}
});

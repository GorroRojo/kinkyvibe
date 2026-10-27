// @vitest-environment jsdom
/**
 * «¿Quisiste decir …@gmail.com?» en el paso «Tus datos» de la compra (jsdom +
 * @testing-library/svelte): aparece al salir del campo con un dominio mal escrito, no a mitad de
 * escribir; «Sí, corregilo» cambia el mail del campo; no bloquea nada.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import BuyerStep from './BuyerStep.svelte';

afterEach(cleanup);

/** Una entrada, sin datos todavía. */
const base = { holders: [{ name: '', pronouns: '' }] };

/** @param {HTMLElement} container */
const emailInput = (container) =>
	/** @type {HTMLInputElement} */ (container.querySelector('input[name="email"]'));

describe('BuyerStep: sugerencia de mail mal escrito', () => {
	it('sugiere al salir del campo y «Sí, corregilo» lo corrige', async () => {
		const { container, queryByRole, getByRole } = render(BuyerStep, { props: { ...base } });
		const input = emailInput(container);
		await fireEvent.input(input, { target: { value: 'persona@gmai.com' } });
		// Mientras escribe, nada.
		expect(queryByRole('status')).toBeNull();
		await fireEvent.change(input);
		expect(getByRole('status').textContent).toContain('persona@gmail.com');
		await fireEvent.click(getByRole('button', { name: 'Sí, corregilo' }));
		expect(input.value).toBe('persona@gmail.com');
		expect(queryByRole('status')).toBeNull();
	});

	it('si sigue escribiendo, la sugerencia se va; con un mail bien escrito no aparece', async () => {
		const { container, queryByRole } = render(BuyerStep, { props: { ...base } });
		const input = emailInput(container);
		await fireEvent.input(input, { target: { value: 'persona@hotmial.com' } });
		await fireEvent.change(input);
		expect(queryByRole('status')).not.toBeNull();
		await fireEvent.input(input, { target: { value: 'persona@hotmail.com' } });
		expect(queryByRole('status')).toBeNull();
		await fireEvent.change(input);
		expect(queryByRole('status')).toBeNull();
		expect(input.value).toBe('persona@hotmail.com');
	});

	it('un mail que ya viene puesto (de la cuenta o del servidor) se revisa de entrada', () => {
		const { getByRole } = render(BuyerStep, { props: { ...base, email: 'persona@gmail.con' } });
		expect(getByRole('status').textContent).toContain('persona@gmail.com');
	});
});

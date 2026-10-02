/**
 * Respuestas de una orden en el panel: las de "una vez por entrada" dicen de qué entrada son y se
 * muestra la pregunta como estaba al comprar.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import OrderAnswers from './OrderAnswers.svelte';

describe('OrderAnswers', () => {
	it('una vez por compra: la pregunta y la respuesta', () => {
		const { body } = render(OrderAnswers, {
			props: { answers: [{ id: 1, label: 'Talle de remera', value: 'M' }] }
		});
		expect(body).toContain('Talle de remera');
		expect(body).toContain('M');
		expect(body).not.toContain('Entrada');
	});

	it('una vez por entrada: una fila por entrada, con su número', () => {
		const { body } = render(OrderAnswers, {
			props: {
				answers: [
					{ id: 2, label: '¿Alguna restricción alimentaria?', value: 'Vegana', ticket: 1 },
					{ id: 2, label: '¿Alguna restricción alimentaria?', value: 'Sin TACC', ticket: 2 }
				]
			}
		});
		expect(body).toContain('Entrada 1 ·');
		expect(body).toContain('Entrada 2 ·');
		expect(body).toContain('Vegana');
		expect(body).toContain('Sin TACC');
	});

	it('sin respuestas: nada', () => {
		expect(render(OrderAnswers, { props: { answers: [] } }).body).not.toContain('<dl');
	});
});

import { describe, expect, it } from 'vitest';
import { countNewOrders, newOrdersText } from './newOrders.js';

describe('aviso de compras nuevas', () => {
	it('cuenta las que la página no tiene así', () => {
		const local = [
			{ id: 'a', status: 'approved' },
			{ id: 'b', status: 'pending' }
		];
		expect(countNewOrders([], local)).toBe(0);
		// Igual que en la página (un cambio de une admin): no es nueva.
		expect(countNewOrders([{ id: 'a', status: 'approved' }], local)).toBe(0);
		// Una que no estaba y una reserva que se pagó.
		expect(
			countNewOrders(
				[
					{ id: 'c', status: 'approved' },
					{ id: 'b', status: 'approved' },
					{ id: 'c', status: 'approved' }
				],
				local
			)
		).toBe(2);
	});

	it('el texto', () => {
		expect(newOrdersText(1)).toBe('1 compra nueva');
		expect(newOrdersText(3)).toBe('3 compras nuevas');
	});
});

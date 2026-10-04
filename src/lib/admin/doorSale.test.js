import { describe, expect, it } from 'vitest';
import { doorOptionLabel, doorSaleBreakdown } from './doorSale.js';
import { computePrice } from '$lib/utils/tickets.js';

const price = (option, quantity = 1) =>
	computePrice({ price: 12000, fondo: 2400, option, quantity, discount: null, method: 'efectivo' });

/** formatARS separa «$» del número con un espacio duro: acá se compara con espacios comunes. */
const flat = (/** @type {string} */ s) => s.replace(/\u00a0/g, ' ');

describe('doorSaleBreakdown', () => {
	it('con el descuento del fondo: la cuenta completa', () => {
		expect(flat(doorSaleBreakdown(price('fondo')))).toBe('$ 12.000 − 20 % fondo = $ 9.600');
	});
	it('varias entradas', () => {
		expect(flat(doorSaleBreakdown(price('fondo', 2), 2))).toBe(
			'2 × $ 12.000 − 20 % fondo = $ 19.200'
		);
	});
	it('con aporte', () => {
		expect(flat(doorSaleBreakdown(price('solidaria')))).toBe(
			'$ 12.000 + 10 % aporte al fondo = $ 13.200'
		);
	});
	it('precio completo: nada que explicar', () => {
		expect(flat(doorSaleBreakdown(price('completo')))).toBe('');
	});
});

describe('doorOptionLabel', () => {
	it('marca la opción por defecto', () => {
		expect(doorOptionLabel({ id: 'fondo', label: 'Con el descuento del fondo' }, 'fondo')).toBe(
			'Con el descuento del fondo (por defecto)'
		);
		expect(doorOptionLabel({ id: 'completo', label: 'Precio completo' }, 'fondo')).toBe(
			'Precio completo'
		);
	});
});

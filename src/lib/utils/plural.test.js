import { describe, expect, it } from 'vitest';
import { entradas, plural } from './plural.js';

describe('plural', () => {
	it('singular solo con 1', () => {
		expect(entradas(1)).toBe('1 entrada');
		expect(entradas(2)).toBe('2 entradas');
		expect(entradas(0)).toBe('0 entradas');
	});
	it('plural irregular', () => {
		expect(plural(1, 'código aprobado', 'códigos aprobados')).toBe('1 código aprobado');
		expect(plural(3, 'código aprobado', 'códigos aprobados')).toBe('3 códigos aprobados');
		expect(plural(2, 'orden', 'órdenes')).toBe('2 órdenes');
	});
});

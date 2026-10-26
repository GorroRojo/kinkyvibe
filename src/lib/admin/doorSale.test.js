import { describe, expect, it } from 'vitest';
import {
	DOOR_SALE_DEFAULT_METHOD,
	doorChargedPrice,
	doorOptionLabel,
	doorPriceChangeText,
	doorSaleBreakdown,
	parseDoorAmount,
	resetDoorSaleForm
} from './doorSale.js';
import { ORDER_MAX_TOTAL, computePrice } from '$lib/utils/tickets.js';

const price = (/** @type {any} */ option, quantity = 1) =>
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

describe('resetDoorSaleForm', () => {
	/** Un form mínimo que se resetea como el del navegador: un radio sin atributo `checked` queda sin marcar. */
	const fakeForm = (/** @type {string} */ marked) => {
		const radios = ['efectivo', 'transferencia'].map((value) => ({
			value,
			checked: value === marked,
			defaultChecked: false
		}));
		const form = {
			radios,
			reset() {
				for (const r of radios) r.checked = r.defaultChecked;
			},
			querySelectorAll: (/** @type {string} */ sel) =>
				sel === 'input[type="radio"][name="method"]' ? radios : []
		};
		return form;
	};
	const marked = (/** @type {any} */ form) =>
		form.radios.filter((/** @type {any} */ r) => r.checked).map((/** @type {any} */ r) => r.value);

	it('después de vender en efectivo, efectivo sigue marcado', () => {
		const form = fakeForm('efectivo');
		expect(resetDoorSaleForm(/** @type {any} */ (form))).toBe('efectivo');
		expect(marked(form)).toEqual(['efectivo']);
	});
	it('después de vender por transferencia, vuelve al de entrada (efectivo)', () => {
		const form = fakeForm('transferencia');
		expect(resetDoorSaleForm(/** @type {any} */ (form))).toBe(DOOR_SALE_DEFAULT_METHOD);
		expect(marked(form)).toEqual(['efectivo']);
	});
});

describe('parseDoorAmount (precio por entrada en la puerta)', () => {
	it('acepta pesos enteros como se escriben en el celu, 0 incluido', () => {
		expect(parseDoorAmount('12000')).toBe(12000);
		expect(parseDoorAmount('12.000')).toBe(12000);
		expect(parseDoorAmount('$ 12.000')).toBe(12000);
		expect(parseDoorAmount('0')).toBe(0);
		expect(parseDoorAmount(String(ORDER_MAX_TOTAL))).toBe(ORDER_MAX_TOTAL);
	});
	it('rechaza negativos, centavos, texto, vacío y lo que pasa el tope de `price`', () => {
		for (const raw of ['-100', '12,5', '1.5', 'abc', '', '  ', String(ORDER_MAX_TOTAL + 1)]) {
			expect(parseDoorAmount(raw), raw).toBeNull();
		}
	});
});

describe('doorChargedPrice (la cuenta a la vista con otro precio)', () => {
	const general = { price: 10000, fondo: 2000 };
	it('sin cambiar el precio: el del tipo, con su Fondo', () => {
		expect(doorChargedPrice(general, '10000', 20)).toEqual({ price: 10000, fondo: 2000 });
		expect(doorChargedPrice(general, '', 20)).toEqual({ price: 10000, fondo: 2000 });
	});
	it('con otro precio: el Fondo con el mismo porcentaje', () => {
		expect(doorChargedPrice(general, '5.000', 20)).toEqual({ price: 5000, fondo: 1000 });
		expect(doorChargedPrice(general, '0', 20)).toEqual({ price: 0, fondo: 0 });
		expect(doorChargedPrice({ price: 8000, fondo: 0 }, '6000', null)).toEqual({
			price: 6000,
			fondo: 0
		});
	});
	it('monto inválido: null', () => {
		expect(doorChargedPrice(general, '-1', 20)).toBeNull();
	});
});

describe('doorPriceChangeText', () => {
	it('dice de cuánto a cuánto; 0 es sin cargo', () => {
		expect(flat(doorPriceChangeText({ charged: 5000, list: 12000 }))).toBe(
			'Precio cambiado en la puerta: $ 5.000 en vez de $ 12.000'
		);
		expect(flat(doorPriceChangeText({ charged: 0, list: 12000 }))).toBe(
			'Precio cambiado en la puerta: sin cargo en vez de $ 12.000'
		);
	});
	it('mismo precio o sin precio de siempre: nada', () => {
		expect(doorPriceChangeText({ charged: 12000, list: 12000 })).toBe('');
		expect(doorPriceChangeText({ charged: 12000, list: null })).toBe('');
	});
});

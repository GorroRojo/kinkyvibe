import { describe, expect, it } from 'vitest';
import { eventHref } from './nav.js';
import { orderFilterFor, orderHref, orderIdFromHash } from './orderFormat.js';

describe('orderHref: link a una orden en Ventas › Órdenes', () => {
	const ordenes = eventHref('evento-de-prueba', 'ordenes');

	it('lleva a la pestaña Órdenes del evento, bajando hasta la orden', () => {
		expect(ordenes).toBe('/admin/eventos/evento-de-prueba/ordenes');
		expect(orderHref(ordenes, 'orden-123')).toBe(
			'/admin/eventos/evento-de-prueba/ordenes#orden-orden-123'
		);
	});

	it('sin orden del servidor (venta sin conexión todavía en el celu, o vacía): null', () => {
		expect(orderHref(ordenes, 'local:venta-0001')).toBeNull();
		expect(orderHref(ordenes, '')).toBeNull();
		expect(orderHref(ordenes, null)).toBeNull();
		expect(orderHref('', 'orden-123')).toBeNull();
	});

	it('ida y vuelta con orderIdFromHash', () => {
		const href = /** @type {string} */ (orderHref(ordenes, 'a b/c'));
		expect(orderIdFromHash(href.slice(href.indexOf('#')))).toBe('a b/c');
	});
});

describe('orderIdFromHash', () => {
	it('lee #orden-<id> y nada más', () => {
		expect(orderIdFromHash('#orden-123')).toBe('123');
		expect(orderIdFromHash('#revisar-ordenes')).toBe('');
		expect(orderIdFromHash('')).toBe('');
		expect(orderIdFromHash(undefined)).toBe('');
		expect(orderIdFromHash('#orden-%E0%A4%A')).toBe('');
	});
});

describe('orderFilterFor: el filtro de Órdenes no esconde la orden del link', () => {
	it('deja el filtro si ya la muestra', () => {
		expect(orderFilterFor('approved', 'approved')).toBe('approved');
		expect(orderFilterFor('pending', 'awaiting_transfer')).toBe('pending');
		expect(orderFilterFor('all', 'refunded')).toBe('all');
	});

	it('si la esconde, pasa a «Todas»', () => {
		expect(orderFilterFor('approved', 'refunded')).toBe('all');
		expect(orderFilterFor('refunded', 'approved')).toBe('all');
		expect(orderFilterFor('approved', 'cancelled')).toBe('all');
	});
});

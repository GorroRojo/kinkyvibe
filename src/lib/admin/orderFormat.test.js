import { describe, expect, it } from 'vitest';
import { eventHref } from './nav.js';
import { orderFilterFor, orderHref, orderIdFromHash, orderMoneyLines } from './orderFormat.js';

describe('orderMoneyLines: la plata de una orden en Órdenes (opción A)', () => {
	// formatARS separa el signo con un espacio duro: en los textos esperados va igual.
	const $ = (/** @type {string} */ s) => s.replaceAll('$ ', '$ ');
	const mp = {
		quantity: 1,
		type: 'General',
		status: 'approved',
		total: 13776,
		fondo: 1500,
		surcharge: 276,
		mpFee: 248
	};

	it('arriba lo que pagó y lo que queda; abajo el Fondo, el recargo y la comisión', () => {
		expect(orderMoneyLines(mp)).toEqual({
			main: $('1 × General · Pagó $ 13.776 · te quedan $ 13.528'),
			detail: $('$ 1.500 del Fondo · recargo MP $ 276 · MP se quedó $ 248')
		});
	});

	it('sin comisión informada, sin «te quedan» ni «MP se quedó»', () => {
		expect(orderMoneyLines({ ...mp, mpFee: null })).toEqual({
			main: $('1 × General · Pagó $ 13.776'),
			detail: $('$ 1.500 del Fondo · recargo MP $ 276')
		});
	});

	it('cada parte del detalle aparece solo si corresponde (transferencia sin nada: vacío)', () => {
		const transfer = { quantity: 2, type: 'General', status: 'approved', total: 20000 };
		expect(orderMoneyLines({ ...transfer, fondo: 0, surcharge: 0, mpFee: null })).toEqual({
			main: $('2 × General · Pagó $ 20.000'),
			detail: ''
		});
	});

	it('los extras suman a lo pagado y van en el detalle («2 × Trago $ 4.000»)', () => {
		const withExtras = {
			...mp,
			extras: [
				{ name: 'Trago', quantity: 2, price: 2000 },
				{ name: 'Remera', quantity: 1, price: 9000 }
			],
			extrasAmount: 13000
		};
		expect(orderMoneyLines(withExtras)).toEqual({
			main: $('1 × General · Pagó $ 26.776 · te quedan $ 26.528'),
			detail: $(
				'$ 1.500 del Fondo · 2 × Trago $ 4.000 · 1 × Remera $ 9.000 · recargo MP $ 276 · MP se quedó $ 248'
			)
		});
	});

	it('gorra, aporte al Fondo y código de descuento', () => {
		const { detail } = orderMoneyLines({
			quantity: 1,
			type: 'A la gorra',
			status: 'approved',
			total: 3000,
			gorra: 3000,
			fondoOption: 'gorra',
			contribution: 500,
			discountCode: 'AMIGUES',
			discountAmount: 1000
		});
		expect(detail).toBe(
			$('a la gorra, $ 3.000 c/u · aporte al Fondo $ 500 (A la gorra) · código AMIGUES −$ 1.000')
		);
	});

	it('una orden sin cobrar dice «Total», no «Pagó», y nunca «te quedan»', () => {
		for (const status of ['pending', 'awaiting_transfer', 'expired', 'rejected', 'cancelled']) {
			expect(orderMoneyLines({ ...mp, status }).main).toBe($('1 × General · Total $ 13.776'));
		}
		expect(orderMoneyLines({ ...mp, status: 'refunded' }).main).toBe(
			$('1 × General · Pagó $ 13.776 · te quedan $ 13.528')
		);
	});
});

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

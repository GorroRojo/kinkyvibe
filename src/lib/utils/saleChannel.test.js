import { describe, expect, it } from 'vitest';
import { SALE_CHANNELS, SALE_CHANNEL_LABELS, countByChannel, saleChannel } from './saleChannel.js';

describe('saleChannel: la regla de las cuatro columnas', () => {
	it('la compra de la página es online (Mercado Pago o transferencia)', () => {
		expect(saleChannel({ channel: 'online', payment_method: 'mercadopago' })).toBe('online');
		expect(saleChannel({ channel: 'online', payment_method: 'transferencia' })).toBe('online');
		// Una orden de antes de la columna `channel`.
		expect(saleChannel({ payment_method: 'mercadopago' })).toBe('online');
		expect(saleChannel({ channel: null, payment_method: 'transferencia' })).toBe('online');
	});

	it('lo vendido con la pantalla de la puerta es puerta, también a la gorra en $ 0', () => {
		expect(saleChannel({ channel: 'puerta', payment_method: 'efectivo' })).toBe('puerta');
		expect(saleChannel({ channel: 'puerta', payment_method: 'transferencia' })).toBe('puerta');
		expect(saleChannel({ channel: 'puerta', payment_method: 'gratis' })).toBe('puerta');
	});

	it('lo que salió $ 0 es cortesía: invitaciones, $ 0 en la puerta y anotarse gratis', () => {
		expect(saleChannel({ channel: 'manual', payment_method: 'gratis' })).toBe('cortesia');
		expect(saleChannel({ channel: 'online', payment_method: 'gratis' })).toBe('cortesia');
		expect(saleChannel({ payment_method: 'gratis' })).toBe('cortesia');
	});

	it('cargada a mano y cobrada es «cargadas a mano», se haya pagado como se haya pagado', () => {
		expect(saleChannel({ channel: 'manual', payment_method: 'transferencia' })).toBe('manual');
		expect(saleChannel({ channel: 'manual', payment_method: 'efectivo' })).toBe('manual');
		expect(saleChannel({ channel: 'manual', payment_method: 'otro' })).toBe('manual');
		expect(saleChannel({ channel: 'manual', payment_method: 'mercadopago' })).toBe('manual');
	});

	it('cada canal tiene su nombre, en orden', () => {
		expect(SALE_CHANNELS).toEqual(['online', 'puerta', 'cortesia', 'manual']);
		expect(Object.keys(SALE_CHANNEL_LABELS)).toEqual([...SALE_CHANNELS]);
	});
});

describe('countByChannel', () => {
	it('suma entradas por canal; sin cantidad, una por orden', () => {
		expect(
			countByChannel([
				{ channel: 'online', payment_method: 'mercadopago', quantity: 2 },
				{ channel: 'puerta', payment_method: 'efectivo', quantity: '3' },
				{ channel: 'manual', payment_method: 'gratis', quantity: 1 },
				{ channel: 'manual', payment_method: 'transferencia', quantity: 4 },
				{ channel: 'manual', payment_method: 'efectivo' }
			])
		).toEqual({ online: 2, puerta: 3, cortesia: 1, manual: 5 });
		expect(countByChannel([])).toEqual({ online: 0, puerta: 0, cortesia: 0, manual: 0 });
	});
});

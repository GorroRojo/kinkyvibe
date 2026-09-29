import { describe, expect, it } from 'vitest';
import { parseTicketConfig, salesState, validatePurchase } from './config.js';

const META = {
	title: 'Fiesta de prueba',
	start: '2026-10-17T21:00-03:00',
	status: 'abierto',
	tickets: [
		{ id: 'general', name: 'General', price: 8000, capacity: 40 },
		{ id: 'reducida', name: 'Reducida', price: 5000, capacity: 10 }
	]
};

describe('parseTicketConfig', () => {
	it('devuelve null si el evento no vende entradas', () => {
		expect(parseTicketConfig({ title: 'x' })).toBeNull();
		expect(parseTicketConfig(undefined)).toBeNull();
	});

	it('normaliza tipos y cierra al empezar el evento por defecto', () => {
		const c = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
			parseTicketConfig(META)
		);
		expect(c.types).toEqual(META.tickets);
		expect(c.closesAt).toBe(new Date('2026-10-17T21:00-03:00').getTime());
	});

	it('respeta tickets_close (string o Date de YAML)', () => {
		const s = parseTicketConfig({ ...META, tickets_close: '2026-10-16T18:00-03:00' });
		expect(s?.closesAt).toBe(Date.parse('2026-10-16T21:00Z'));
		const d = parseTicketConfig({ ...META, tickets_close: new Date('2026-10-16T21:00Z') });
		expect(d?.closesAt).toBe(Date.parse('2026-10-16T21:00Z'));
	});

	it.each([
		[[], /lista/],
		[[{ id: 'General', price: 1, capacity: 1 }], /Id de entrada/],
		[
			[
				{ id: 'a', price: 1, capacity: 1 },
				{ id: 'a', price: 1, capacity: 1 }
			],
			/repetido/
		],
		[[{ id: 'a', price: 0, capacity: 1 }], /Precio/],
		[[{ id: 'a', price: 10.5, capacity: 1 }], /Precio/],
		[[{ id: 'a', price: '8000', capacity: 'x' }], /Cupo/]
	])('rechaza configuraciones inválidas %#', (tickets, error) => {
		expect(() => parseTicketConfig({ ...META, tickets })).toThrow(error);
	});
});

describe('salesState', () => {
	const c = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
		parseTicketConfig(META)
	);
	it('abierta antes del cierre, cerrada después', () => {
		expect(salesState(c, Date.parse('2026-10-01T00:00Z'))).toEqual({ open: true });
		expect(salesState(c, Date.parse('2026-10-18T00:00Z'))).toEqual({
			open: false,
			reason: 'closed'
		});
	});
	it('cancelado y agotadas cierran la venta', () => {
		expect(salesState({ ...c, status: 'cancelado' }, 0)).toMatchObject({ reason: 'cancelled' });
		expect(salesState({ ...c, status: 'agotadas' }, 0)).toMatchObject({ reason: 'soldout' });
	});
});

describe('validatePurchase', () => {
	const c = /** @type {NonNullable<ReturnType<typeof parseTicketConfig>>} */ (
		parseTicketConfig(META)
	);
	const ok = {
		type: 'reducida',
		quantity: '3',
		name: '  Ale   Prueba ',
		email: ' Ale@Example.COM ',
		accept: 'on'
	};

	it('calcula el total con el precio del servidor', () => {
		const r = validatePurchase(c, { ...ok, price: 1 });
		expect(r).toMatchObject({
			ok: true,
			quantity: 3,
			name: 'Ale Prueba',
			email: 'ale@example.com',
			total: 15000
		});
	});

	it.each([
		[{ type: 'vip' }, 'type'],
		[{ quantity: '0' }, 'quantity'],
		[{ quantity: '5' }, 'quantity'],
		[{ quantity: '1.5' }, 'quantity'],
		[{ name: 'A' }, 'name'],
		[{ email: 'no-es-mail' }, 'email'],
		[{ accept: null }, 'accept']
	])('marca errores %#', (patch, field) => {
		const r = validatePurchase(c, { ...ok, ...patch });
		expect(r.ok).toBe(false);
		expect(/** @type {any} */ (r).errors[field]).toBeTruthy();
	});
});

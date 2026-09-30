import { describe, expect, it } from 'vitest';
import { summarizeTickets } from './checkout.js';

/**
 * @param {Partial<import('./checkout.js').TicketsView['types'][number]>[]} types
 * @returns {import('./checkout.js').TicketsView}
 */
const view = (types) => ({
	open: true,
	reason: null,
	opensAt: null,
	closesAt: null,
	maxQuantity: 20,
	mock: false,
	methods: ['mercadopago'],
	transferHoldHours: 48,
	feeBasisPoints: 0,
	contactEmail: 'prueba@example.com',
	online: false,
	fondoEnabled: false,
	fondoPercent: null,
	door: { on: true, price: '$ 12.000' },
	types: types.map((t, i) => ({
		id: `t${i}`,
		name: `Tipo ${i}`,
		price: 8000,
		fondo: 0,
		available: 20,
		left: null,
		gorra: null,
		closesAt: null,
		closed: false,
		...t
	}))
});

describe('summarizeTickets (botón "Comprar entradas")', () => {
	it('"Quedan N" solo si todos los tipos a la venta tienen cupo y quedan menos de 10', () => {
		expect(
			summarizeTickets(
				view([
					{ available: 4, left: 4 },
					{ available: 3, left: 3 }
				])
			).left
		).toBe(7);
		// Entre los dos quedan 10 o más: sin número.
		expect(
			summarizeTickets(
				view([
					{ available: 6, left: 6 },
					{ available: 5, left: 5 }
				])
			).left
		).toBeNull();
		// Un tipo sin cupo (o con muchas): nunca se muestra un número.
		expect(summarizeTickets(view([{ available: 2, left: 2 }, {}])).left).toBeNull();
		expect(summarizeTickets(view([{}])).left).toBeNull();
		// Los agotados o cerrados no cuentan.
		expect(
			summarizeTickets(view([{ available: 2, left: 2 }, { available: 0 }, { closed: true }])).left
		).toBe(2);
	});

	it('pasa lo de la puerta', () => {
		expect(summarizeTickets(view([{}])).door).toEqual({ on: true, price: '$ 12.000' });
	});
});

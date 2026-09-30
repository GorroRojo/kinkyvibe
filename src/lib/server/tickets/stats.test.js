import { describe, expect, it } from 'vitest';
import {
	argentinaDay,
	codesUsed,
	fondoBreakdown,
	heldBreakdown,
	paymentSplit,
	salesPerDay
} from './stats.js';

// 2026-09-30 15:00 en Argentina (18:00 UTC).
const NOW = Date.parse('2026-09-30T18:00:00Z');
const HOUR = 3600 * 1000;

/**
 * @param {Partial<import('./stats.js').StatsOrder>} o
 * @returns {import('./stats.js').StatsOrder}
 */
const order = (o) =>
	/** @type {import('./stats.js').StatsOrder} */ ({
		status: 'approved',
		quantity: 1,
		total: 1000,
		created_at: NOW,
		payment_method: 'mercadopago',
		fondo_option: 'completo',
		fondo_amount: 0,
		fondo_contribution: 0,
		discount_code: null,
		discount_amount: 0,
		expires_at: NOW + HOUR,
		...o
	});

describe('argentinaDay', () => {
	it('usa la hora de Argentina (UTC−3)', () => {
		// 01:00 UTC del 1/10 son las 22:00 del 30/9 en Argentina.
		expect(argentinaDay(Date.parse('2026-10-01T01:00:00Z'))).toBe('2026-09-30');
		expect(argentinaDay(Date.parse('2026-10-01T03:00:00Z'))).toBe('2026-10-01');
	});
});

describe('salesPerDay', () => {
	it('devuelve 14 días, del más viejo a hoy, con ceros donde no hubo ventas', () => {
		const days = salesPerDay([], { now: NOW });
		expect(days).toHaveLength(14);
		expect(days[0].date).toBe('2026-09-17');
		expect(days.at(-1)?.date).toBe('2026-09-30');
		expect(days.every((d) => d.tickets === 0 && d.orders === 0)).toBe(true);
	});

	it('suma entradas y montos de las aprobadas por día de Argentina', () => {
		const days = salesPerDay(
			[
				order({ quantity: 2, total: 2000 }),
				order({ quantity: 3, total: 3000, created_at: NOW - 2 * HOUR }),
				// 22:00 del 29/9 en Argentina (01:00 UTC del 30/9): cuenta para el 29.
				order({ created_at: Date.parse('2026-09-30T01:00:00Z') }),
				// No aprobadas: no cuentan.
				order({ status: 'pending', quantity: 5 }),
				order({ status: 'refunded', quantity: 5 }),
				// Más viejas que la ventana: no cuentan.
				order({ created_at: NOW - 20 * 24 * HOUR })
			],
			{ now: NOW }
		);
		expect(days.at(-1)).toEqual({ date: '2026-09-30', tickets: 5, orders: 2, amount: 5000 });
		expect(days.at(-2)).toEqual({ date: '2026-09-29', tickets: 1, orders: 1, amount: 1000 });
		expect(days.reduce((s, d) => s + d.tickets, 0)).toBe(6);
	});

	it('acepta otra cantidad de días (con límites)', () => {
		expect(salesPerDay([], { now: NOW, days: 7 })).toHaveLength(7);
		expect(salesPerDay([], { now: NOW, days: 0 })).toHaveLength(1);
		expect(salesPerDay([], { now: NOW, days: 1000 })).toHaveLength(90);
	});
});

describe('paymentSplit', () => {
	it('siempre devuelve los 3 medios en el mismo orden', () => {
		expect(paymentSplit([]).map((r) => r.method)).toEqual([
			'mercadopago',
			'transferencia',
			'gratis'
		]);
		expect(paymentSplit([]).every((r) => r.share === 0)).toBe(true);
	});

	it('reparte por entradas aprobadas, con porcentaje de un decimal', () => {
		const split = paymentSplit([
			order({ quantity: 2, total: 2000 }),
			order({ payment_method: 'transferencia', quantity: 1, total: 900 }),
			order({ payment_method: 'gratis', total: 0 }),
			order({ payment_method: 'transferencia', status: 'awaiting_transfer', quantity: 4 })
		]);
		expect(split).toEqual([
			{ method: 'mercadopago', orders: 1, tickets: 2, amount: 2000, share: 50 },
			{ method: 'transferencia', orders: 1, tickets: 1, amount: 900, share: 25 },
			{ method: 'gratis', orders: 1, tickets: 1, amount: 0, share: 25 }
		]);
	});

	it('redondea a un decimal', () => {
		const split = paymentSplit([order({}), order({}), order({ payment_method: 'transferencia' })]);
		expect(split[0].share).toBe(66.7);
		expect(split[1].share).toBe(33.3);
	});
});

describe('fondoBreakdown', () => {
	it('agrupa por opción y calcula el neto (aportes − fondo usado)', () => {
		const f = fondoBreakdown([
			order({ fondo_option: 'fondo', quantity: 2, fondo_amount: 4000 }),
			order({ fondo_option: 'solidaria', fondo_contribution: 1000 }),
			order({ fondo_option: 'sugar', fondo_contribution: 5000 }),
			order({ fondo_option: 'fondo', status: 'refunded', fondo_amount: 2000 })
		]);
		expect(f.used).toBe(4000);
		expect(f.contributed).toBe(6000);
		expect(f.net).toBe(2000);
		expect(f.rows.find((r) => r.option === 'fondo')).toEqual({
			option: 'fondo',
			tickets: 2,
			used: 4000,
			contributed: 0
		});
	});
});

describe('codesUsed', () => {
	it('cuenta órdenes aprobadas por código, del más usado al menos', () => {
		const codes = codesUsed([
			order({ discount_code: 'B', discount_amount: 100 }),
			order({ discount_code: 'A', discount_amount: 200, quantity: 2 }),
			order({ discount_code: 'A', discount_amount: 200 }),
			order({ discount_code: 'A', status: 'cancelled', discount_amount: 999 }),
			order({})
		]);
		expect(codes).toEqual([
			{ code: 'A', orders: 2, tickets: 3, discounted: 400 },
			{ code: 'B', orders: 1, tickets: 1, discounted: 100 }
		]);
	});
});

describe('heldBreakdown', () => {
	it('separa pagos en curso de transferencias, solo reservas vigentes', () => {
		const held = heldBreakdown(
			[
				order({ status: 'pending', quantity: 2 }),
				order({ status: 'rejected', quantity: 1 }),
				order({ status: 'awaiting_transfer', quantity: 3 }),
				order({ status: 'awaiting_transfer', quantity: 9, expires_at: NOW - 1 }),
				order({ status: 'approved', quantity: 9 })
			],
			NOW
		);
		expect(held).toEqual({ paying: 3, transfers: 3, total: 6 });
	});
});

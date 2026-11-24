import { describe, expect, it } from 'vitest';
import { computeAccount, emptyAccount, eventIncome } from './reparto.js';
import { formatSignedARS } from '$lib/utils/money.js';
import {
	eventProfit,
	pastProfitHint,
	profitHint,
	profitLabel,
	profitPerPerson,
	profitText
} from './ganancia.js';

const orders = /** @type {any[]} */ ([
	{
		status: 'approved',
		quantity: 2,
		total: 20420,
		payment_method: 'mercadopago',
		channel: 'online',
		surcharge_amount: 420,
		fondo_amount: 0,
		fondo_contribution: 0
	},
	{
		status: 'approved',
		quantity: 1,
		total: 12000,
		payment_method: 'efectivo',
		channel: 'puerta',
		surcharge_amount: 0,
		fondo_amount: 0,
		fondo_contribution: 0
	}
]);

describe('eventProfit', () => {
	it('sin cuenta guardada: lo que entró, sin gastos (ni la regla por defecto del lugar)', () => {
		const p = eventProfit({ income: eventIncome(orders) });
		expect(p).toEqual({
			amount: 32000,
			closed: false,
			noExpenses: true,
			income: 32000,
			expenses: 0
		});
		expect(profitLabel(/** @type {any} */ (p))).toBe('Ganancia estimada');
		expect(profitHint(/** @type {any} */ (p))).toBe('sin gastos cargados');
		expect(pastProfitHint(/** @type {any} */ (p))).toBe(
			'falta cerrar la cuenta, sin gastos cargados'
		);
		expect(profitText(/** @type {any} */ (p))).toBe(
			`Ganancia estimada: ${formatSignedARS(32000)} (sin gastos cargados)`
		);
	});

	it('con la cuenta guardada: la misma cuenta que Gastos y reparto', () => {
		const income = eventIncome(orders);
		const account = emptyAccount();
		const p = eventProfit({ income, account });
		expect(p?.amount).toBe(computeAccount(income, account).profit);
		expect(p?.amount).toBe(32000 - 9600);
		expect(p?.noExpenses).toBe(false);
		expect(profitHint(/** @type {any} */ (p))).toBe('');
		expect(pastProfitHint(/** @type {any} */ (p))).toBe('falta cerrar la cuenta');
	});

	it('cerrada: el número del cierre, «Ganancia» a secas', () => {
		const p = eventProfit({
			income: null,
			closing: { profit: -5000, income_total: 10000, expenses_total: 15000 }
		});
		expect(p).toMatchObject({ amount: -5000, closed: true });
		expect(profitText(/** @type {any} */ (p), { past: true })).toBe(
			`Ganancia: ${formatSignedARS(-5000)}`
		);
	});

	it('sin ingresos ni cierre: nada', () => {
		expect(eventProfit({ income: null })).toBe(null);
	});

	it('por persona que entró', () => {
		expect(profitPerPerson({ amount: 10000 }, 3)).toBe(3333);
		expect(profitPerPerson({ amount: 10000 }, 0)).toBe(null);
	});
});

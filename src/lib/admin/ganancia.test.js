import { describe, expect, it } from 'vitest';
import { computeAccount, emptyAccount, eventIncome, shownAccount } from './reparto.js';
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
	it('sin cuenta guardada y con regla del lugar: la cuenta que muestra Gastos y reparto', () => {
		const income = eventIncome(orders);
		const venueRule = { kind: /** @type {const} */ ('fijo'), amount: 5000 };
		const p = eventProfit({ income, venueRule });
		expect(p).toEqual({
			amount: 27000,
			closed: false,
			noExpenses: false,
			venueDefault: true,
			income: 32000,
			expenses: 5000
		});
		expect(p?.amount).toBe(computeAccount(income, shownAccount(null, venueRule)).profit);
		expect(profitLabel(/** @type {any} */ (p))).toBe('Ganancia estimada');
		expect(profitHint(/** @type {any} */ (p))).toBe('con la regla del lugar');
		expect(pastProfitHint(/** @type {any} */ (p))).toBe(
			'falta cerrar la cuenta, con la regla del lugar'
		);
		expect(profitText(/** @type {any} */ (p))).toBe(
			`Ganancia estimada: ${formatSignedARS(27000)} (con la regla del lugar)`
		);
	});

	it('sin cuenta guardada ni regla del lugar: la de talleres, como la página', () => {
		const income = eventIncome(orders);
		const p = eventProfit({ income });
		expect(p?.amount).toBe(computeAccount(income, emptyAccount()).profit);
		expect(p?.amount).toBe(32000 - 9600);
		expect(p).toMatchObject({ noExpenses: false, venueDefault: true });
		expect(profitHint(/** @type {any} */ (p))).toBe('con la regla del lugar');
	});

	it('sin cuenta guardada y una regla sin gastos: «sin gastos cargados»', () => {
		const p = eventProfit({
			income: eventIncome(orders),
			venueRule: { kind: 'fijo', amount: 0 }
		});
		expect(p).toMatchObject({ amount: 32000, noExpenses: true, venueDefault: false, expenses: 0 });
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
		expect(p?.venueDefault).toBe(false);
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

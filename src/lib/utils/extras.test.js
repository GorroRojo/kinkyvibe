import { describe, expect, it } from 'vitest';
import {
	EXTRA_HARD_MAX,
	extraAvailable,
	extraDeliveryText,
	extraSummaryText,
	extrasAmount,
	extrasCsvCells,
	extrasShortText,
	orderPaid,
	parseExtras,
	readExtrasChoice,
	validateExtrasChoice
} from './extras.js';
import { applyDiscount, computePrice, mpSurcharge } from './tickets.js';
import { purchaseSummary } from './purchaseSteps.js';
import { formatARS } from './money.js';

const TRAGO = {
	id: 'trago',
	name: 'Trago',
	price: 3000,
	description: '',
	capacity: 10,
	perOrder: 4
};
const REMERA = {
	id: 'remera',
	name: 'Remera',
	price: 15000,
	description: 'Talle único',
	capacity: null,
	perOrder: null
};

describe('parseExtras', () => {
	it('sin la clave: ninguno', () => {
		expect(parseExtras(undefined)).toEqual({ extras: [], errors: [] });
	});

	it('normaliza: precio entero, tope y máximo opcionales', () => {
		const { extras, errors } = parseExtras([
			{ id: 'trago', name: ' Trago ', price: 3000, capacity: 10, per_order: 4 },
			{ id: 'remera', name: 'Remera', price: '15000', description: 'Talle único' }
		]);
		expect(errors).toEqual([]);
		expect(extras).toEqual([TRAGO, REMERA]);
	});

	it('rechaza precio 0, ids repetidos o inválidos y máximo 0; con un error, ninguno', () => {
		const { extras, errors } = parseExtras([
			{ id: 'trago', name: 'Trago', price: 0 },
			{ id: 'trago', name: 'Otro', price: 100 },
			{ id: 'Mal Id', name: 'X', price: 100 },
			{ id: 'ok', name: 'Ok', price: 100, per_order: 0 }
		]);
		expect(extras).toEqual([]);
		expect(errors).toHaveLength(4);
		expect(errors[0]).toMatch(/precio/);
		expect(errors[1]).toMatch(/repetido/);
	});
});

describe('lo que se puede elegir', () => {
	it('el máximo por compra y, con tope, lo que queda', () => {
		expect(extraAvailable(TRAGO, 0)).toBe(4);
		expect(extraAvailable(TRAGO, 8)).toBe(2);
		expect(extraAvailable(TRAGO, 12)).toBe(0);
		expect(extraAvailable(REMERA, 1000)).toBe(EXTRA_HARD_MAX);
	});

	it('lee `extra_<id>` y valida contra el máximo y lo que queda', () => {
		const form = new FormData();
		form.set('extra_trago', '2');
		form.set('extra_remera', '0');
		const choice = readExtrasChoice([TRAGO, REMERA], (k) => form.get(k));
		expect(choice).toEqual({ trago: '2', remera: '0' });
		expect(validateExtrasChoice([TRAGO, REMERA], choice)).toEqual({
			ok: true,
			lines: [{ id: 'trago', name: 'Trago', price: 3000, quantity: 2 }]
		});
		const tooMany = validateExtrasChoice([TRAGO], { trago: '5' });
		expect(tooMany).toEqual({
			ok: false,
			errors: { extra_trago: 'Podés llevar hasta 4 de «Trago» por compra.' }
		});
		const soldOut = validateExtrasChoice([TRAGO], { trago: '2' }, { available: { trago: 1 } });
		expect(soldOut).toEqual({ ok: false, errors: { extra_trago: 'Quedan 1 de «Trago».' } });
		expect(validateExtrasChoice([TRAGO], { trago: '1.5' }).ok).toBe(false);
		expect(validateExtrasChoice([TRAGO], { otro: '1' }).ok).toBe(false);
	});
});

describe('computePrice con extras (decisión 0056)', () => {
	const extras = extrasAmount([
		{ price: 3000, quantity: 2 },
		{ price: 15000, quantity: 1 }
	]);

	it('el Fondo y el código son solo de las entradas; el recargo de MP es de todo', () => {
		const p = computePrice({
			price: 10000,
			fondo: 2000,
			option: 'fondo',
			quantity: 2,
			discount: { kind: 'percent', value: 50 },
			method: 'mercadopago',
			feeBasisPoints: 773,
			extras
		});
		// Entradas: 2 × 10.000 − 4.000 de Fondo = 16.000; −50 % = 8.000 (los extras no se tocan).
		expect(p.fondo).toBe(4000);
		expect(p.discount).toBe(8000);
		expect(p.extras).toBe(21000);
		// Recargo sobre 8.000 + 21.000.
		expect(p.surcharge).toBe(mpSurcharge(29000, 773));
		expect(p.total).toBe(8000 + p.surcharge);
		expect(p.paid).toBe(8000 + 21000 + p.surcharge);
	});

	it('transferencia: sin recargo; lo pagado es entradas + extras', () => {
		const p = computePrice({ price: 8000, quantity: 1, method: 'transferencia', extras: 6000 });
		expect(p).toMatchObject({ surcharge: 0, total: 8000, extras: 6000, paid: 14000 });
	});

	it('un código de 100 % deja las entradas en 0 pero los extras se pagan', () => {
		const p = computePrice({
			price: 8000,
			quantity: 1,
			discount: { kind: 'percent', value: 100 },
			method: 'mercadopago',
			feeBasisPoints: 500,
			extras: 3000
		});
		expect(p.total - p.surcharge).toBe(0);
		expect(p.paid).toBe(3000 + mpSurcharge(3000, 500));
	});

	it.each([
		['mercadopago', 773],
		['transferencia', 0],
		['mercadopago', 0]
	])('las cuentas de la base cierran (%s, %i)', (method, fee) => {
		for (const ex of [0, 1, 2999, 50000]) {
			const p = computePrice({
				price: 9999,
				fondo: 1234,
				option: 'solidaria',
				quantity: 3,
				discount: { kind: 'fixed', value: 1500 },
				method,
				feeBasisPoints: fee,
				extras: ex
			});
			// Los CHECK de migrations/0002 y 0010, sin cambios.
			expect(p.subtotal).toBe(9999 * 3 - p.fondo + p.contribution);
			expect(p.total).toBe(p.subtotal - p.discount + p.surcharge);
			expect(p.discount).toBe(applyDiscount(p.subtotal, { kind: 'fixed', value: 1500 }).discount);
			// Y lo pagado (`orderPaid`).
			expect(p.paid).toBe(orderPaid({ total: p.total, extras_amount: ex }));
		}
	});

	it('extras inválidos tiran', () => {
		expect(() => computePrice({ price: 1, quantity: 1, extras: -1 })).toThrow();
		expect(() => computePrice({ price: 1, quantity: 1, extras: 1.5 })).toThrow();
	});
});

describe('textos', () => {
	it('canje, resumen y la línea corta', () => {
		expect(extraDeliveryText({ name: 'Trago', quantity: 2, delivered: 0 })).toBe(
			'2 × Trago · 0 entregados'
		);
		expect(extraDeliveryText({ name: 'Trago', quantity: 2, delivered: 1 })).toBe(
			'2 × Trago · 1 entregado'
		);
		expect(extraSummaryText({ name: 'Trago', sold: 34, delivered: 12 })).toBe(
			'Trago: vendidos 34 · entregados 12'
		);
		expect(extrasShortText([{ name: 'Trago', quantity: 2 }])).toBe('+ 2 × Trago');
		expect(extrasShortText([])).toBe('');
	});

	it('el resumen de la compra: una línea por extra y el total pagado', () => {
		const prices = computePrice({ price: 8000, quantity: 1, extras: 6000 });
		const s = purchaseSummary({
			type: { name: 'General' },
			count: 1,
			prices,
			gorra: false,
			showOption: false,
			discountCode: null,
			free: false,
			feeBasisPoints: 0,
			methods: ['transferencia'],
			extras: [{ id: 'trago', name: 'Trago', price: 3000, quantity: 2 }]
		});
		expect(s.lines.map((l) => [l.label, l.amount])).toEqual([
			[`Entradas (1 × ${formatARS(8000)})`, formatARS(8000)],
			[`Trago (2 × ${formatARS(3000)})`, formatARS(6000)]
		]);
		expect(s.total).toBe(formatARS(14000));
	});
});

describe('ordenes.csv: extras y monto_extras', () => {
	it('texto con lo entregado y el monto solo en la fila de la entrada 1', () => {
		const extras = [
			{ name: 'Trago', quantity: 2, price: 3000, delivered: 1 },
			{ name: 'Remera', quantity: 1, price: 15000, delivered: 0 }
		];
		expect(extrasCsvCells(extras, { first: true })).toEqual([
			'2 × Trago (1 entregado), 1 × Remera',
			21000
		]);
		expect(extrasCsvCells(extras, { first: false })).toEqual([
			'2 × Trago (1 entregado), 1 × Remera',
			''
		]);
		expect(extrasCsvCells([], { first: true })).toEqual(['', 0]);
	});
});

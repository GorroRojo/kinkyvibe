import { describe, expect, it } from 'vitest';
import {
	FONDO_OPTIONS,
	applyDiscount,
	computePrice,
	LOW_STOCK,
	defaultFondoOption,
	doorText,
	fondoOptionLabel,
	fondoOptionsFor,
	gorraQuickAmounts,
	exceedsOrderMax,
	holdHours,
	leftText,
	mpSurcharge,
	normalizeCode,
	normalizeDni,
	orderReference,
	parseAmount,
	parseFeePercent,
	publicLeft,
	purchaseConditions,
	refundPolicy,
	remainingOf,
	unitPrice
} from './tickets.js';

describe('cupo: lo que queda y lo que se muestra en público', () => {
	it('remainingOf: null sin cupo; nunca negativo', () => {
		expect(remainingOf({ capacity: null }, { sold: 50, held: 3 })).toBeNull();
		expect(remainingOf({ capacity: 10 }, undefined)).toBe(10);
		expect(remainingOf({ capacity: 10 }, { sold: 6, held: 1 })).toBe(3);
		expect(remainingOf({ capacity: 2 }, { sold: 3, held: 0 })).toBe(0);
	});

	it('publicLeft: el número solo con cupo y menos de 10 (y alguna)', () => {
		expect(LOW_STOCK).toBe(10);
		expect(publicLeft(null)).toBeNull();
		expect(publicLeft(0)).toBeNull();
		expect(publicLeft(10)).toBeNull();
		expect(publicLeft(200)).toBeNull();
		expect(publicLeft(9)).toBe(9);
		expect(publicLeft(1)).toBe(1);
	});

	it('leftText', () => {
		expect(leftText(9)).toBe('Quedan 9');
		expect(leftText(4)).toBe('Quedan 4');
		expect(leftText(3)).toBe('¡Últimas 3!');
		expect(leftText(1)).toBe('¡Última!');
	});

	it('doorText: true (con o sin precio), false = solo anticipadas; sin la clave u online, nada', () => {
		expect(doorText({ on: true, explicit: true, price: '$ 12.000' })).toBe(
			'También hay entradas en la puerta: $ 12.000.'
		);
		expect(doorText({ on: true, explicit: true, price: '' })).toBe(
			'También hay entradas en la puerta.'
		);
		expect(doorText({ on: false, explicit: true, price: '' })).toBe(
			'Solo anticipadas: no hay entradas en la puerta.'
		);
		// Sin `puerta` en el frontmatter (eventos de antes): no se dice nada.
		expect(doorText({ on: true, explicit: false, price: '' })).toBeNull();
		expect(doorText(null)).toBeNull();
	});
});
import { formatSignedARS } from './money.js';

describe('applyDiscount', () => {
	it('sin descuento', () => {
		expect(applyDiscount(16000, null)).toEqual({ subtotal: 16000, discount: 0, total: 16000 });
	});

	it.each([
		// subtotal, %, descuento
		[16000, 20, 3200],
		[8000, 100, 8000],
		[5000, 15, 750],
		// Redondeo al peso: 3 × 3333 = 9999 · 10% = 999,9 → 1000
		[9999, 10, 1000],
		// 0,5 redondea hacia arriba: 4999 · 10% = 499,9 → 500; 5 · 10% = 0,5 → 1
		[4999, 10, 500],
		[5, 10, 1],
		// 1 · 33% = 0,33 → 0
		[1, 33, 0]
	])('porcentaje: %i con %i%% → −%i', (subtotal, value, discount) => {
		const r = applyDiscount(subtotal, { kind: 'percent', value });
		expect(r).toEqual({ subtotal, discount, total: subtotal - discount });
		expect(Number.isInteger(r.total)).toBe(true);
	});

	it('monto fijo: por compra, nunca por debajo de 0', () => {
		expect(applyDiscount(16000, { kind: 'fixed', value: 3000 })).toEqual({
			subtotal: 16000,
			discount: 3000,
			total: 13000
		});
		expect(applyDiscount(5000, { kind: 'fixed', value: 99999 })).toEqual({
			subtotal: 5000,
			discount: 5000,
			total: 0
		});
	});

	it('porcentajes fuera de rango no dejan el total negativo', () => {
		expect(applyDiscount(8000, { kind: 'percent', value: 150 }).total).toBe(0);
		expect(applyDiscount(8000, { kind: 'percent', value: -10 }).total).toBe(8000);
		expect(applyDiscount(8000, { kind: 'fixed', value: 0 }).total).toBe(8000);
	});
});

describe('normalizeDni', () => {
	it('acepta puntos y espacios, devuelve solo dígitos', () => {
		expect(normalizeDni('12.345.678')).toBe('12345678');
		expect(normalizeDni('1234567')).toBe('1234567');
		expect(normalizeDni('123456789')).toBe('123456789');
	});
	it('rechaza largos y caracteres raros', () => {
		for (const bad of ['123456', '1234567890', '12-345-678', 'abc', '', null, 12345678]) {
			expect(normalizeDni(bad)).toBeNull();
		}
	});
});

describe('normalizeCode / orderReference', () => {
	it('códigos en mayúsculas, 3–32 de [A-Z0-9_-]', () => {
		expect(normalizeCode(' amigues20 ')).toBe('AMIGUES20');
		expect(normalizeCode('ab')).toBeNull();
		expect(normalizeCode('con espacio')).toBeNull();
		expect(normalizeCode("x' OR 1=1")).toBeNull();
	});
	it('referencia corta de la orden', () => {
		expect(orderReference('1a2b3c4d-0000-4000-8000-000000000000')).toBe('KV-1A2B3C4D');
	});
});

describe('recargo de Mercado Pago', () => {
	it.each([
		// base, tasa (centésimos de %), recargo. bruto = ⌈base / (1 − tasa)⌉
		[8000, 773, 671], // 8000 / 0,9227 = 8670,2 → 8671
		[10000, 773, 838], // 10837,75 → 10838
		[8000, 2000, 2000], // exacto: 8000 / 0,8 = 10000 (sin sumar un peso por decimales)
		[1, 773, 1], // 1,08 → 2
		[8000, 0, 0],
		[0, 773, 0]
	])('%i con %i → +%i', (base, bp, surcharge) => {
		expect(mpSurcharge(base, bp)).toBe(surcharge);
	});

	it('después de la comisión queda al menos la base', () => {
		for (const base of [1, 99, 5000, 7999, 8000, 12345, 250000]) {
			for (const bp of [1, 399, 639, 773, 1000, 2500]) {
				const gross = base + mpSurcharge(base, bp);
				expect(gross - (gross * bp) / 10000).toBeGreaterThanOrEqual(base - 1e-9);
				// y el recargo es el mínimo: un peso menos ya no alcanza
				const less = gross - 1;
				expect(less - (less * bp) / 10000).toBeLessThan(base);
			}
		}
	});

	it('lee el porcentaje de la variable o el frontmatter', () => {
		expect(parseFeePercent('7.73')).toBe(773);
		expect(parseFeePercent('7,73')).toBe(773);
		expect(parseFeePercent(6.39)).toBe(639);
		expect(parseFeePercent('')).toBeNull();
		expect(parseFeePercent(undefined)).toBeNull();
		expect(parseFeePercent('siete')).toBeNull();
		expect(parseFeePercent('-1')).toBeNull();
		expect(parseFeePercent('50')).toBeNull();
	});
});

describe('computePrice (fondo → descuento → recargo)', () => {
	it('sin nada extra', () => {
		expect(computePrice({ price: 8000, quantity: 2 })).toEqual({
			option: 'completo',
			unit: 8000,
			list: 16000,
			fondo: 0,
			contribution: 0,
			subtotal: 16000,
			discount: 0,
			surcharge: 0,
			total: 16000
		});
	});

	it('el fondo baja el precio de cada entrada', () => {
		expect(computePrice({ price: 10000, fondo: 2000, quantity: 3 })).toMatchObject({
			list: 30000,
			fondo: 6000,
			subtotal: 24000,
			total: 24000
		});
	});

	it('el código se aplica sobre el precio con fondo, y el recargo al final', () => {
		const p = computePrice({
			price: 10000,
			fondo: 2000,
			quantity: 2,
			discount: { kind: 'percent', value: 20 },
			method: 'mercadopago',
			feeBasisPoints: 773
		});
		// 16000 − 20% = 12800; 12800 / 0,9227 = 13872,33 → 13873
		expect(p).toEqual({
			option: 'fondo',
			unit: 8000,
			list: 20000,
			fondo: 4000,
			contribution: 0,
			subtotal: 16000,
			discount: 3200,
			surcharge: 1073,
			total: 13873
		});
	});

	it('transferencia no paga recargo; total 0 tampoco', () => {
		const base = { price: 8000, quantity: 1, feeBasisPoints: 773 };
		expect(computePrice({ ...base, method: 'transferencia' }).total).toBe(8000);
		expect(computePrice({ ...base, method: 'mercadopago' }).total).toBe(8671);
		expect(
			computePrice({ ...base, method: 'mercadopago', discount: { kind: 'percent', value: 100 } })
		).toMatchObject({ surcharge: 0, total: 0 });
	});
});

describe('opciones del fondo: "¿Cómo querés pagar tu entrada?"', () => {
	it('las cinco opciones y sus porcentajes sobre el precio completo', () => {
		expect(FONDO_OPTIONS.map((o) => [o.id, o.label, o.percent])).toEqual([
			['fondo', 'Con el descuento del fondo', 0],
			['completo', 'Precio completo', 0],
			['solidaria', 'Entrada solidaria', 10],
			['muy-solidaria', 'Entrada muy solidaria', 30],
			['sugar', 'Entrada Sugar', 50]
		]);
		expect(fondoOptionLabel('sugar')).toBe('Entrada Sugar (+50 %)');
		expect(fondoOptionLabel('fondo')).toBe('Con el descuento del fondo');
	});

	it('sin fondo no se ofrece la primera opción y el default es precio completo', () => {
		expect(fondoOptionsFor(0).map((o) => o.id)).toEqual([
			'completo',
			'solidaria',
			'muy-solidaria',
			'sugar'
		]);
		expect(fondoOptionsFor(2000)).toHaveLength(5);
		expect(defaultFondoOption(0)).toBe('completo');
		expect(defaultFondoOption(2000)).toBe('fondo');
		expect(computePrice({ price: 10000, fondo: 2000, quantity: 1 }).option).toBe('fondo');
		expect(computePrice({ price: 10000, quantity: 1 }).option).toBe('completo');
	});

	// $ 10.000 con $ 2.000 de fondo, 2 entradas (a mano).
	it.each([
		['fondo', 8000, 4000, 0, 16000],
		['completo', 10000, 0, 0, 20000],
		['solidaria', 11000, 0, 2000, 22000],
		['muy-solidaria', 13000, 0, 6000, 26000],
		['sugar', 15000, 0, 10000, 30000]
	])('con fondo: %s → %i por entrada', (option, unit, fondo, contribution, subtotal) => {
		const p = computePrice({
			price: 10000,
			fondo: 2000,
			option: /** @type {any} */ (option),
			quantity: 2,
			method: 'transferencia',
			feeBasisPoints: 773
		});
		expect(p).toEqual({
			option,
			unit,
			list: 20000,
			fondo,
			contribution,
			subtotal,
			discount: 0,
			surcharge: 0,
			total: subtotal
		});
	});

	it('los aportes se redondean al peso por entrada (0,5 hacia arriba) y se multiplican', () => {
		// 4999: 10 % = 499,9 → 500; 30 % = 1499,7 → 1500; 50 % = 2499,5 → 2500.
		expect(unitPrice(4999, 0, 'solidaria')).toEqual({ fondo: 0, contribution: 500, price: 5499 });
		expect(unitPrice(4999, 0, 'muy-solidaria')).toMatchObject({ contribution: 1500 });
		expect(unitPrice(4999, 0, 'sugar')).toMatchObject({ contribution: 2500, price: 7499 });
		expect(computePrice({ price: 4999, option: 'sugar', quantity: 3 })).toMatchObject({
			contribution: 7500,
			subtotal: 22497,
			total: 22497
		});
		// 3333: 10 % = 333,3 → 333
		expect(unitPrice(3333, 0, 'solidaria').contribution).toBe(333);
	});

	it('orden: opción del fondo → código → recargo de Mercado Pago', () => {
		// Solidaria: 2 × 11.000 = 22.000; −20 % = 17.600; 17.600 / 0,9227 = 19.074,45 → 19.075.
		expect(
			computePrice({
				price: 10000,
				fondo: 2000,
				option: 'solidaria',
				quantity: 2,
				discount: { kind: 'percent', value: 20 },
				method: 'mercadopago',
				feeBasisPoints: 773
			})
		).toEqual({
			option: 'solidaria',
			unit: 11000,
			list: 20000,
			fondo: 0,
			contribution: 2000,
			subtotal: 22000,
			discount: 4400,
			surcharge: 1475,
			total: 19075
		});
		// Sugar sin fondo con código fijo de $ 1.500 por compra, transferencia: 7.500 − 1.500.
		expect(
			computePrice({
				price: 5000,
				option: 'sugar',
				quantity: 1,
				discount: { kind: 'fixed', value: 1500 },
				method: 'transferencia',
				feeBasisPoints: 773
			})
		).toMatchObject({ contribution: 2500, subtotal: 7500, discount: 1500, total: 6000 });
	});

	// Todas las combinaciones: 5 opciones × con/sin fondo × sin código/20 %/$ 1.500/100 % × MP/transferencia.
	const combos = [];
	for (const option of FONDO_OPTIONS.map((o) => o.id))
		for (const fondo of [0, 2000])
			for (const discount of [
				null,
				{ kind: /** @type {const} */ ('percent'), value: 20 },
				{ kind: /** @type {const} */ ('fixed'), value: 1500 },
				{ kind: /** @type {const} */ ('percent'), value: 100 }
			])
				for (const method of ['mercadopago', 'transferencia'])
					combos.push({ option, fondo, discount, method });
	it.each(combos)('invariantes %#: %j', ({ option, fondo, discount, method }) => {
		const price = 9999;
		const quantity = 3;
		const p = computePrice({
			price,
			fondo,
			option,
			quantity,
			discount,
			method,
			feeBasisPoints: 773
		});
		const pct = { fondo: 0, completo: 0, solidaria: 10, 'muy-solidaria': 30, sugar: 50 }[option];
		const expectedFondo = option === 'fondo' ? fondo * quantity : 0;
		const expectedContribution = Math.round((price * pct) / 100) * quantity;
		expect(p.fondo).toBe(expectedFondo);
		expect(p.contribution).toBe(expectedContribution);
		expect(p.subtotal).toBe(price * quantity - expectedFondo + expectedContribution);
		expect(p.unit * quantity).toBe(p.subtotal);
		const d = applyDiscount(p.subtotal, discount);
		expect(p.discount).toBe(d.discount);
		expect(p.surcharge).toBe(method === 'mercadopago' ? mpSurcharge(d.total, 773) : 0);
		expect(p.total).toBe(p.subtotal - p.discount + p.surcharge);
		for (const n of Object.values(p))
			if (typeof n === 'number') expect(Number.isInteger(n)).toBe(true);
		expect(p.fondo).toBeGreaterThanOrEqual(0);
		expect(p.contribution).toBeGreaterThanOrEqual(0);
		if (discount?.value === 100) expect(p.total).toBe(0);
	});
});

describe('holdHours', () => {
	it('horas de la reserva de una orden', () => {
		expect(holdHours({ created_at: 0, expires_at: 48 * 3600000 })).toBe(48);
		expect(holdHours({ created_at: 0, expires_at: 20 * 60000 })).toBe(1);
	});
});

describe('política de devoluciones', () => {
	it('usa el contacto configurado y no promete facturas', () => {
		const p = refundPolicy('contacto@example.com');
		const text = [p.title, ...p.paragraphs].join(' ');
		expect(text).toContain('5 días hábiles');
		expect(text).toContain('contacto@example.com');
		expect(text).not.toMatch(/factura/i);
	});
});

describe('a la gorra: precio', () => {
	it('el monto elegido por entrada, sin fondo ni aporte ni código; con recargo de MP', () => {
		const p = computePrice({
			price: 7000,
			fondo: 2000,
			option: 'gorra',
			quantity: 2,
			discount: { kind: 'percent', value: 50 },
			method: 'mercadopago',
			feeBasisPoints: 773
		});
		expect(p).toEqual({
			option: 'gorra',
			unit: 7000,
			list: 14000,
			fondo: 0,
			contribution: 0,
			subtotal: 14000,
			discount: 0,
			surcharge: 1173,
			total: 15173
		});
		expect(
			computePrice({ price: 7000, option: 'gorra', quantity: 2, method: 'transferencia' }).total
		).toBe(14000);
	});

	it('monto 0: total 0 aun con Mercado Pago (camino sin pago)', () => {
		expect(
			computePrice({
				price: 0,
				option: 'gorra',
				quantity: 3,
				method: 'mercadopago',
				feeBasisPoints: 773
			}).total
		).toBe(0);
	});

	it.each([
		['5000', 5000],
		['5.000', 5000],
		['$ 5.000', 5000],
		['$5000', 5000],
		['5000,00', 5000],
		['0', 0],
		[1200, 1200]
	])('parseAmount(%j) = %i', (raw, n) => {
		expect(parseAmount(raw)).toBe(n);
	});

	it.each(['', 'abc', '-1', '5,5', '5.00', '1e3', '50.00.0', null, 1.5, -3])(
		'parseAmount(%j) = null',
		(raw) => {
			expect(parseAmount(raw)).toBeNull();
		}
	);
});

describe('condiciones de compra', () => {
	it('una sola lista, con la política de devoluciones incluida', () => {
		const list = purchaseConditions({
			contactEmail: 'contacto@example.com',
			transferHoldHours: 48,
			methods: ['mercadopago', 'transferencia']
		});
		expect(list.join(' ')).toContain('18 años');
		expect(list.join(' ')).toContain('20 minutos');
		expect(list.join(' ')).toContain('48 horas');
		expect(list.join(' ')).toContain('5 días hábiles antes del evento');
		expect(list.join(' ')).toContain('taller grabado');
		expect(list.at(-1)).toContain('contacto@example.com');
		expect(list.at(-1)).toMatch(/nombre, sus pronombres y su email/);
		const online = purchaseConditions({
			contactEmail: 'c@example.com',
			transferHoldHours: 48,
			methods: ['mercadopago'],
			online: true
		});
		expect(online.join(' ')).not.toMatch(/QR|puerta|transferencia/);
	});
});

describe('formatSignedARS', () => {
	it('muestra el signo', () => {
		expect(formatSignedARS(2000)).toMatch(/^\+\$\s2\.000$/);
		expect(formatSignedARS(-4000)).toMatch(/^−\$\s4\.000$/);
		expect(formatSignedARS(0)).toMatch(/^\$\s0$/);
	});
});

describe('a la gorra: botones rápidos y tope técnico', () => {
	it.each([
		// mínimo, sugerido → botones
		[1000, 5000, [1000, 5000, 7500, 10000]],
		[0, 5000, [5000, 7500, 10000]], // el mínimo 0 no tiene botón
		[0, 3333, [3333, 5000, 6666]], // 1,5 × 3333 = 4999,5 → $ 5.000
		[0, 150, [150, 200, 300]], // 225 → 200 (a los $ 100 más cercanos)
		[5000, 5000, [5000, 7500, 10000]], // mínimo = sugerido: una sola vez
		[0, 100, [100, 200]], // 1,5 × 100 = 150 → 200 = el doble: sin repetir
		[0, 0, [0]] // sugerido 0: solo "Sin cargo"
	])('mínimo %i, sugerido %i → %j', (min, suggested, expected) => {
		expect(gorraQuickAmounts(min, suggested)).toEqual(expected);
	});

	it('el mínimo recomendado tiene su botón (si es mayor a 0 y no repite otro)', () => {
		expect(gorraQuickAmounts(1000, 5000, 3000)).toEqual([1000, 3000, 5000, 7500, 10000]);
		expect(gorraQuickAmounts(0, 5000, 5000)).toEqual([5000, 7500, 10000]);
		expect(gorraQuickAmounts(0, 5000, null)).toEqual([5000, 7500, 10000]);
		expect(gorraQuickAmounts(0, 5000, 0)).toEqual([5000, 7500, 10000]);
	});

	it('no hay botón "mitad"', () => {
		expect(gorraQuickAmounts(0, 10000)).not.toContain(5000);
	});

	it('el tope es por orden (monto × cantidad), no por entrada', () => {
		expect(exceedsOrderMax(100_000_000, 1)).toBe(false);
		expect(exceedsOrderMax(100_000_001, 1)).toBe(true);
		expect(exceedsOrderMax(50_000_000, 2)).toBe(false);
		expect(exceedsOrderMax(50_000_001, 2)).toBe(true);
		expect(exceedsOrderMax(1_000_000, 20)).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import {
	applyDiscount,
	computePrice,
	mpSurcharge,
	normalizeCode,
	normalizeDni,
	orderReference,
	parseFeePercent,
	refundPolicy
} from './tickets.js';

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
			list: 16000,
			fondo: 0,
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
			list: 20000,
			fondo: 4000,
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

describe('política de devoluciones', () => {
	it('usa el contacto configurado y no promete facturas', () => {
		const p = refundPolicy('contacto@example.com');
		const text = [p.title, ...p.paragraphs].join(' ');
		expect(text).toContain('5 días hábiles');
		expect(text).toContain('contacto@example.com');
		expect(text).not.toMatch(/factura/i);
	});
});

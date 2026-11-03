/**
 * Cuentas de PayPal (docs/propinas.md, «PayPal: cotización, ajuste y retiros»): el ajuste, la
 * cotización efectiva, los pesos estimados (redondeo para abajo, sin errores de coma flotante) y lo
 * que se escribe en el panel.
 */
import { describe, expect, it } from 'vitest';
import {
	dayLabel,
	effectiveRate,
	estimateArs,
	fondoMonthSpan,
	formatUSD,
	parseAdjustmentPct,
	parseArsInt,
	parseUsdCents
} from './paypal.js';

describe('parseAdjustmentPct', () => {
	it('acepta enteros y hasta 2 decimales, con coma o punto, signo y %', () => {
		expect(parseAdjustmentPct('-4')).toBe(-4);
		expect(parseAdjustmentPct('−4')).toBe(-4);
		expect(parseAdjustmentPct('-3,5')).toBe(-3.5);
		expect(parseAdjustmentPct('+2.25')).toBe(2.25);
		expect(parseAdjustmentPct(' -4 % ')).toBe(-4);
		expect(parseAdjustmentPct('50')).toBe(50);
		expect(parseAdjustmentPct('-50')).toBe(-50);
	});

	it('vacío es 0 (y -0 también)', () => {
		expect(parseAdjustmentPct('')).toBe(0);
		expect(parseAdjustmentPct(null)).toBe(0);
		expect(Object.is(parseAdjustmentPct('-0'), 0)).toBe(true);
	});

	it('rechaza lo que no es un porcentaje entre −50 y 50', () => {
		for (const v of [
			'abc',
			'-50.01',
			'51',
			'100',
			'1.234',
			'1e2',
			'--4',
			'4-',
			'NaN',
			'Infinity'
		]) {
			expect(parseAdjustmentPct(v), v).toBeNull();
		}
	});
});

describe('effectiveRate', () => {
	it('base × (1 + ajuste / 100), con 2 decimales', () => {
		expect(effectiveRate(1200, -4)).toBe(1152);
		expect(effectiveRate(1567.4, 0)).toBe(1567.4);
		expect(effectiveRate(1567.4, -4)).toBe(1504.7);
		expect(effectiveRate(1000, 2.5)).toBe(1025);
	});
});

describe('estimateArs', () => {
	it('floor(neto × base × (1 + ajuste / 100)) en pesos enteros, sin errores de coma flotante', () => {
		// 10 USD × 1200 × 0,96 = 11.520 justo (con floats daría 11.519,999…).
		expect(estimateArs(1000, 1200, -4)).toBe(11_520);
		expect(estimateArs(1000, 1200, 0)).toBe(12_000);
		// 9,41 USD × 1567,40 = 14.749,234 → 14.749.
		expect(estimateArs(941, 1567.4, 0)).toBe(14_749);
		// 9,41 × 1567,40 × 0,965 = 14.233,010… → 14.233.
		expect(estimateArs(941, 1567.4, -3.5)).toBe(14_233);
		// 0,01 USD × 1567,40 = 15,674 → 15.
		expect(estimateArs(1, 1567.4, 0)).toBe(15);
	});

	it('siempre redondea para abajo', () => {
		// 1 USD × 1000,99 = 1000,99 → 1000.
		expect(estimateArs(100, 1000.99, 0)).toBe(1000);
		expect(estimateArs(100, 999.999, 0)).toBe(1000); // la base se toma con 2 decimales: 1000,00
	});

	it('datos que no sirven: 0', () => {
		expect(estimateArs(0, 1200, 0)).toBe(0);
		expect(estimateArs(-100, 1200, 0)).toBe(0);
		expect(estimateArs(1000, 0, 0)).toBe(0);
		expect(estimateArs(1000, NaN, 0)).toBe(0);
		expect(estimateArs(Infinity, 1200, 0)).toBe(0);
		expect(estimateArs(1000, 1200, NaN)).toBe(0);
	});

	it('montos grandes, exactos', () => {
		// 1.000.000 USD × 2.000 = 2.000.000.000.
		expect(estimateArs(100_000_000, 2000, 0)).toBe(2_000_000_000);
	});
});

describe('lo que se escribe en el panel', () => {
	it('parseUsdCents', () => {
		expect(parseUsdCents('120')).toBe(12_000);
		expect(parseUsdCents('120,50')).toBe(12_050);
		expect(parseUsdCents('120.5')).toBe(12_050);
		expect(parseUsdCents('1.234,56')).toBe(123_456);
		expect(parseUsdCents('US$ 99.9')).toBe(9990);
		for (const v of ['', '0', '-5', 'abc', '1.234.5', '12,345', '99999999']) {
			expect(parseUsdCents(v), v).toBeNull();
		}
	});

	it('parseArsInt', () => {
		expect(parseArsInt('150000')).toBe(150_000);
		expect(parseArsInt('150.000')).toBe(150_000);
		expect(parseArsInt('$ 1.500.000')).toBe(1_500_000);
		for (const v of ['', '0', '-1', '150000,50', 'abc', '1.50']) {
			expect(parseArsInt(v), v).toBeNull();
		}
	});

	it('dayLabel, fondoMonthSpan y formatUSD', () => {
		expect(dayLabel('2026-11-02')).toBe('2/11/2026');
		expect(fondoMonthSpan('2026-10')).toBe('5/10 al 4/11');
		expect(fondoMonthSpan('2026-12')).toBe('5/12 al 4/1');
		expect(formatUSD(123_456)).toMatch(/^US\$\s?1\.234,56$/);
	});
});

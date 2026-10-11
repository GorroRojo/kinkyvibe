import { describe, expect, it } from 'vitest';
import {
	PERIOD_PARAM,
	SALES_DEFAULT_PERIOD,
	SALES_PERIODS,
	SERIE_PARAM,
	VISITS_DEFAULT_PERIOD,
	VISITS_MAX_DAYS,
	VISITS_PERIODS,
	changeText,
	filterHref,
	parsePeriod,
	periodFromUrl,
	periodRange,
	periodText,
	previousText,
	relativeChange
} from './statsPeriod.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-11T15:00:00Z');

describe('opciones y valores por defecto (decisión de gorrite, 11/10)', () => {
	it('Ventas y Asistencia: 30 días / 90 días / 12 meses / Todo, por defecto 12 meses', () => {
		expect(SALES_PERIODS.map((p) => [p.id, p.label])).toEqual([
			['30d', '30 días'],
			['90d', '90 días'],
			['12m', '12 meses'],
			['todo', 'Todo']
		]);
		expect(SALES_DEFAULT_PERIOD).toBe('12m');
	});
	it('Visitas al sitio: 7 / 30 / 90 días, por defecto 30, nunca más de 90', () => {
		expect(VISITS_PERIODS.map((p) => [p.id, p.label])).toEqual([
			['7d', '7 días'],
			['30d', '30 días'],
			['90d', '90 días']
		]);
		expect(VISITS_DEFAULT_PERIOD).toBe('30d');
		expect(VISITS_MAX_DAYS).toBe(90);
		for (const p of VISITS_PERIODS) expect(p.days).toBeLessThanOrEqual(VISITS_MAX_DAYS);
	});
});

describe('parsePeriod y periodFromUrl', () => {
	it('toma el período válido de la URL', () => {
		const url = new URL('https://kinkyvibe.test/admin/estadisticas/ventas?periodo=30d');
		expect(periodFromUrl(url, SALES_PERIODS, SALES_DEFAULT_PERIOD).id).toBe('30d');
		expect(parsePeriod('todo', SALES_PERIODS, SALES_DEFAULT_PERIOD).id).toBe('todo');
		expect(parsePeriod('7d', VISITS_PERIODS, VISITS_DEFAULT_PERIOD)).toMatchObject({ days: 7 });
	});
	it('sin período, o con uno que no es de esa pestaña, va el de por defecto', () => {
		const bare = new URL('https://kinkyvibe.test/admin/estadisticas/ventas');
		expect(periodFromUrl(bare, SALES_PERIODS, SALES_DEFAULT_PERIOD).id).toBe('12m');
		expect(periodFromUrl(bare, VISITS_PERIODS, VISITS_DEFAULT_PERIOD).id).toBe('30d');
		for (const raw of ['', 'xx', '12M', '365d', '7d', null, undefined])
			expect(parsePeriod(raw, SALES_PERIODS, SALES_DEFAULT_PERIOD).id, String(raw)).toBe('12m');
		// «Todo» y «12 meses» no son de Visitas (Analytics Engine guarda unos 3 meses).
		for (const raw of ['todo', '12m', '180d'])
			expect(parsePeriod(raw, VISITS_PERIODS, VISITS_DEFAULT_PERIOD).id, raw).toBe('30d');
	});
	it('un valor por defecto que no existe es un error de programación', () => {
		expect(() => parsePeriod('x', SALES_PERIODS, 'nada')).toThrow();
	});
});

describe('periodRange', () => {
	it('días: [ahora − N días, ahora) y el anterior del mismo largo', () => {
		const r = periodRange(parsePeriod('30d', SALES_PERIODS, '12m'), NOW);
		expect(r).toEqual({
			from: NOW - 30 * DAY,
			to: NOW,
			prevFrom: NOW - 60 * DAY,
			prevTo: NOW - 30 * DAY
		});
	});
	it('meses: el mismo día de hace 12 meses, y el anterior desde hace 24', () => {
		const r = periodRange(parsePeriod('12m', SALES_PERIODS, '12m'), NOW);
		expect(new Date(/** @type {number} */ (r.from)).toISOString()).toBe('2025-10-11T15:00:00.000Z');
		expect(new Date(/** @type {number} */ (r.prevFrom)).toISOString()).toBe(
			'2024-10-11T15:00:00.000Z'
		);
		expect(r.prevTo).toBe(r.from);
	});
	it('todo: sin desde y sin período anterior', () => {
		expect(periodRange(parsePeriod('todo', SALES_PERIODS, '12m'), NOW)).toEqual({
			from: null,
			to: NOW,
			prevFrom: null,
			prevTo: null
		});
	});
});

describe('textos y comparación', () => {
	const p30 = parsePeriod('30d', SALES_PERIODS, '12m');
	const p12 = parsePeriod('12m', SALES_PERIODS, '12m');
	const all = parsePeriod('todo', SALES_PERIODS, '12m');
	it('cómo se dice cada período', () => {
		expect(periodText(p30)).toBe('últimos 30 días');
		expect(periodText(p12)).toBe('últimos 12 meses');
		expect(periodText(all)).toBe('desde el principio');
		expect(previousText(p30)).toBe('los 30 días anteriores');
		expect(previousText(all)).toBe('');
	});
	it('el cambio contra el período anterior, sin dividir por cero', () => {
		expect(relativeChange(150, 100)).toBe(0.5);
		expect(relativeChange(5, 0)).toBeNull();
		expect(relativeChange(5, null)).toBeNull();
		expect(changeText(150, 100, p30)).toBe('▲ 50 % vs. los 30 días anteriores');
		expect(changeText(75, 100, p12)).toBe('▼ 25 % vs. los 12 meses anteriores');
		expect(changeText(100, 100, p30)).toBe('= vs. los 30 días anteriores');
		expect(changeText(100, 0, p30)).toBe('');
		expect(changeText(100, 50, all)).toBe('');
	});
});

describe('filterHref', () => {
	it('arma el link con el período y la serie, sin los vacíos', () => {
		const href = filterHref('/admin/estadisticas/ventas', {
			[PERIOD_PARAM]: '90d',
			[SERIE_PARAM]: 'fiesta-rara'
		});
		const url = new URL(href, 'https://kinkyvibe.test');
		expect(url.pathname).toBe('/admin/estadisticas/ventas');
		expect(url.searchParams.get('periodo')).toBe('90d');
		expect(url.searchParams.get('serie')).toBe('fiesta-rara');

		const bare = new URL(
			filterHref('/admin/estadisticas/visitas', { [PERIOD_PARAM]: '7d', [SERIE_PARAM]: '' }),
			'https://kinkyvibe.test'
		);
		expect([...bare.searchParams.keys()]).toEqual(['periodo']);
		expect(filterHref('/admin/estadisticas/visitas', {})).toBe('/admin/estadisticas/visitas');
	});
});

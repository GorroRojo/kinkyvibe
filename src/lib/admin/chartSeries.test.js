import { describe, expect, it } from 'vitest';
import {
	OVERALL_SPAN,
	barPath,
	bucketSales,
	labelEvery,
	monthStart,
	niceTicks,
	weekStart
} from './chartSeries.js';

/** Día (entero) de una fecha. @param {string} iso */
const day = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

describe('periods', () => {
	it('starts weeks on Monday and months on the 1st', () => {
		expect(weekStart(day('2026-10-01'))).toBe(day('2026-09-28')); // jueves → lunes
		expect(weekStart(day('2026-09-28'))).toBe(day('2026-09-28'));
		expect(weekStart(day('2026-10-04'))).toBe(day('2026-09-28')); // domingo
		expect(monthStart(day('2026-10-17'))).toBe(day('2026-10-01'));
		expect(monthStart(day('2026-01-17'), -1)).toBe(day('2025-12-01'));
	});
});

describe('bucketSales', () => {
	const days = [
		{ day: day('2026-09-01'), slug: 'a', tickets: 2, revenue: 200 },
		{ day: day('2026-09-03'), slug: 'a', tickets: 1, revenue: 100 },
		{ day: day('2026-09-03'), slug: 'b', tickets: 5, revenue: 50 },
		{ day: day('2026-09-29'), slug: 'b', tickets: 1, revenue: 10 }
	];
	const today = day('2026-10-01');

	it('covers the last N periods overall, with empty ones in 0', () => {
		const byDay = bucketSales(days, { bucket: 'day', today });
		expect(byDay).toHaveLength(OVERALL_SPAN.day);
		expect(byDay.at(-1)).toMatchObject({ date: '2026-10-01', tickets: 0 });
		expect(byDay.find((r) => r.date === '2026-09-03')).toMatchObject({ tickets: 6, revenue: 150 });

		const byWeek = bucketSales(days, { bucket: 'week', today });
		expect(byWeek).toHaveLength(OVERALL_SPAN.week);
		expect(byWeek.at(-1)).toMatchObject({ date: '2026-09-28', tickets: 1, label: 'sem. 28/9' });
		expect(byWeek.reduce((s, r) => s + r.tickets, 0)).toBe(9);

		const byMonth = bucketSales(days, { bucket: 'month', today });
		expect(byMonth).toHaveLength(12);
		expect(byMonth.at(-2)).toMatchObject({ date: '2026-09-01', tickets: 9, revenue: 360 });
		expect(byMonth.at(-1)?.label).toMatch(/oct 26/);
	});
	it('goes from the first to the last sale of one event', () => {
		const a = bucketSales(days, { bucket: 'day', slug: 'a', today });
		expect(a.map((r) => [r.date, r.tickets])).toEqual([
			['2026-09-01', 2],
			['2026-09-02', 0],
			['2026-09-03', 1]
		]);
		expect(bucketSales(days, { bucket: 'week', slug: 'nada', today })).toEqual([]);
	});
});

describe('axes', () => {
	it('picks round ticks that include zero and the extremes', () => {
		expect(niceTicks(0, 87)).toEqual([0, 20, 40, 60, 80, 100]);
		expect(niceTicks(-30, 90)).toEqual([-50, 0, 50, 100]);
		expect(niceTicks(0, 125000)).toEqual([0, 50000, 100000, 150000]);
		expect(niceTicks(0, 0)).toEqual([0, 1]);
		expect(niceTicks(0, 3)).toEqual([0, 1, 2, 3]);
	});
	it('thins the X labels so they fit', () => {
		expect(labelEvery(10, 640)).toBe(1);
		expect(labelEvery(60, 330)).toBe(12);
		expect(labelEvery(0, 300)).toBe(1);
	});
	it('rounds only the data end of a bar, also for negative bars', () => {
		expect(barPath(0, 100, 100, 10)).toBe('');
		expect(barPath(10, 100, 60, 20)).toBe('M10,100 V64 Q10,60 14,60 H26 Q30,60 30,64 V100Z');
		expect(barPath(10, 100, 140, 20)).toBe('M10,100 V136 Q10,140 14,140 H26 Q30,140 30,136 V100Z');
		expect(barPath(0, 100, 98, 20)).toBe('M0,100 V100 Q0,98 2,98 H18 Q20,98 20,100 V100Z');
	});
});

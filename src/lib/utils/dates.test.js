import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
	argDate,
	argDateTimeLong,
	argTime,
	argWeekdayDay,
	eventEnd,
	toArgentina
} from './dates.js';

describe('toArgentina', () => {
	it('gives the Argentina wall-clock time in local getters (UTC-3, no DST)', () => {
		const a = toArgentina('2026-09-11T19:30:00-03:00');
		expect([a.getFullYear(), a.getMonth(), a.getDate(), a.getHours(), a.getMinutes()]).toEqual([
			2026, 8, 11, 19, 30
		]);
		// January is the southern summer: still -3, Argentina has no DST
		expect(toArgentina('2026-01-15T12:00:00Z').getHours()).toBe(9);
	});

	it('rolls back to the previous day before 03:00 UTC', () => {
		const a = toArgentina('2026-03-01T02:00:00Z');
		expect([a.getMonth(), a.getDate(), a.getHours()]).toEqual([1, 28, 23]);
	});
});

describe('eventEnd', () => {
	const start = '2026-09-11T20:00:00-03:00';

	it('uses the end when it is after the start', () => {
		expect(eventEnd(start, '2026-09-11T23:00:00-03:00').toISOString()).toBe(
			'2026-09-12T02:00:00.000Z'
		);
	});

	it('moves an end past midnight written with the start date to the next day', () => {
		expect(eventEnd(start, '2026-09-11T01:30:00-03:00').toISOString()).toBe(
			'2026-09-12T04:30:00.000Z'
		);
	});

	it('keeps an earlier end on a different day as is', () => {
		expect(eventEnd(start, '2026-09-10T22:00:00-03:00').toISOString()).toBe(
			'2026-09-11T01:00:00.000Z'
		);
	});

	it('falls back to the start when the end is missing or invalid', () => {
		expect(eventEnd(start, undefined).toISOString()).toBe('2026-09-11T23:00:00.000Z');
		expect(eventEnd(start, 'no es una fecha').toISOString()).toBe('2026-09-11T23:00:00.000Z');
	});
});

describe('argDate / argTime / argWeekdayDay', () => {
	it('format in Argentina time', () => {
		const d = '2026-09-11T19:30:00-03:00';
		expect(argDate(d)).toBe('2026-09-11');
		expect(argTime(d)).toBe('19:30');
		expect(argWeekdayDay(d)).toBe('viernes 11');
	});

	it('handle the day rollover and zero padding', () => {
		const d = '2026-03-01T02:05:00Z'; // 23:05 on Feb 28 in Argentina
		expect(argDate(d)).toBe('2026-02-28');
		expect(argTime(d)).toBe('23:05');
		expect(argWeekdayDay('2026-10-05T12:00:00-03:00')).toBe('lunes 05');
		expect(argTime('2026-10-05T00:00:00-03:00')).toBe('00:00');
	});

	it('print the same as the date-fns formats they replace', () => {
		for (let i = 0; i < 400; i++) {
			// a spread of instants over a couple of years, at odd minutes
			const d = new Date(Date.UTC(2025, 0, 1) + i * 37 * 3_600_000 + i * 60_000);
			const a = toArgentina(d);
			expect(argDate(d)).toBe(format(a, 'yyyy-MM-dd'));
			expect(argTime(d)).toBe(format(a, 'HH:mm'));
			expect(argWeekdayDay(d)).toBe(format(a, 'EEEE dd', { locale: es }));
		}
	});

	it('return NaN strings for invalid input (callers check validity first)', () => {
		expect(argDate('nope')).toContain('NaN');
	});
});

describe('argDateTimeLong', () => {
	it('prints the long date and a 24-hour time with «hs» (no «p. m.»)', () => {
		expect(argDateTimeLong('2026-10-02T15:00:00-03:00')).toBe(
			'2 de octubre de 2026 a las 15:00 hs'
		);
		expect(argDateTimeLong('2026-10-02T19:00:00-03:00')).toBe(
			'2 de octubre de 2026 a las 19:00 hs'
		);
		expect(argDateTimeLong('2026-10-02T15:00:00-03:00')).not.toMatch(/m\.|am|pm/i);
	});

	it('keeps the minutes and pads the hour', () => {
		expect(argDateTimeLong('2026-12-19T21:30:00-03:00')).toBe(
			'19 de diciembre de 2026 a las 21:30 hs'
		);
		expect(argDateTimeLong('2026-01-05T09:05:00-03:00')).toBe('5 de enero de 2026 a las 09:05 hs');
	});

	it('midnight is 00:00 of the next day, and after midnight stays in 24 h', () => {
		expect(argDateTimeLong('2026-10-03T00:00:00-03:00')).toBe(
			'3 de octubre de 2026 a las 00:00 hs'
		);
		expect(argDateTimeLong('2026-10-03T01:30:00-03:00')).toBe(
			'3 de octubre de 2026 a las 01:30 hs'
		);
		expect(argDateTimeLong('2026-10-02T12:00:00-03:00')).toBe(
			'2 de octubre de 2026 a las 12:00 hs'
		);
	});

	it('uses Argentina time whatever the input offset (and a Date works too)', () => {
		// 02:30 UTC is still 23:30 of the previous day in Argentina
		expect(argDateTimeLong('2026-03-01T02:30:00Z')).toBe('28 de febrero de 2026 a las 23:30 hs');
		expect(argDateTimeLong(new Date('2026-10-02T18:00:00Z'))).toBe(
			'2 de octubre de 2026 a las 15:00 hs'
		);
	});

	it('an invalid date gives an empty string', () => {
		expect(argDateTimeLong('no es una fecha')).toBe('');
	});
});

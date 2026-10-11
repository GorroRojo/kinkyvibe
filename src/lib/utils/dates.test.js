import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
	argFormat,
	argDate,
	argDateList,
	argDateLog,
	argDateLong,
	argDateParts,
	argDateShort,
	argDateTimeCsv,
	argDateTimeLong,
	argDayMonth,
	argTime,
	argWeekdayDay,
	eventDateList,
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

describe('argDateTimeLong (encabezados)', () => {
	it('prints weekday, long date and a 24-hour time, without «hs» (no «p. m.»)', () => {
		expect(argDateTimeLong('2026-10-02T15:00:00-03:00')).toBe(
			'viernes 2 de octubre de 2026, 15:00'
		);
		expect(argDateTimeLong('2026-10-02T19:00:00-03:00')).toBe(
			'viernes 2 de octubre de 2026, 19:00'
		);
		expect(argDateTimeLong('2026-10-02T15:00:00-03:00')).not.toMatch(/m\.|am|pm|hs/i);
	});

	it('keeps the minutes and pads the hour', () => {
		expect(argDateTimeLong('2026-12-19T21:30:00-03:00')).toBe(
			'sábado 19 de diciembre de 2026, 21:30'
		);
		expect(argDateTimeLong('2026-01-05T09:05:00-03:00')).toBe('lunes 5 de enero de 2026, 09:05');
	});

	it('midnight is 00:00 of the next day, and after midnight stays in 24 h', () => {
		expect(argDateTimeLong('2026-10-03T00:00:00-03:00')).toBe('sábado 3 de octubre de 2026, 00:00');
		expect(argDateTimeLong('2026-10-03T01:30:00-03:00')).toBe('sábado 3 de octubre de 2026, 01:30');
		expect(argDateTimeLong('2026-10-02T12:00:00-03:00')).toBe(
			'viernes 2 de octubre de 2026, 12:00'
		);
	});

	it('uses Argentina time whatever the input offset (and a Date works too)', () => {
		// 02:30 UTC is still 23:30 of the previous day in Argentina
		expect(argDateTimeLong('2026-03-01T02:30:00Z')).toBe('sábado 28 de febrero de 2026, 23:30');
		expect(argDateTimeLong(new Date('2026-10-02T18:00:00Z'))).toBe(
			'viernes 2 de octubre de 2026, 15:00'
		);
	});

	it('without the time', () => {
		expect(argDateTimeLong('2026-10-02T15:00:00-03:00', { time: false })).toBe(
			'viernes 2 de octubre de 2026'
		);
	});

	it('an invalid date gives an empty string', () => {
		expect(argDateTimeLong('no es una fecha')).toBe('');
	});
});

describe('argDateList (listas)', () => {
	const now = '2026-10-04T12:00:00-03:00';
	it('«vie 2 oct · 22:00», in Argentina time', () => {
		expect(argDateList('2026-10-02T22:00:00-03:00', { now })).toBe('vie 2 oct · 22:00');
		expect(argDateList('2026-10-03T01:00:00Z', { now })).toBe('vie 2 oct · 22:00');
		expect(argDateList('2026-12-19T09:05:00-03:00', { now })).toBe('sáb 19 dic · 09:05');
	});
	it('without the time, and with the year when it is not this year', () => {
		expect(argDateList('2026-10-02T22:00:00-03:00', { now, time: false })).toBe('vie 2 oct');
		expect(argDateList('2025-10-02T22:00:00-03:00', { now })).toBe('jue 2 oct 2025 · 22:00');
	});
	it('never ISO nor «hs»; invalid gives an empty string', () => {
		expect(argDateList('2026-10-02T22:00:00-03:00', { now })).not.toMatch(/\d{4}-\d{2}|hs/);
		expect(argDateList('no es una fecha')).toBe('');
	});
});

describe('argDateLog (registros)', () => {
	it('«2/10/26 13:43», in Argentina time', () => {
		expect(argDateLog('2026-10-02T13:43:00-03:00')).toBe('2/10/26 13:43');
		expect(argDateLog('2026-03-01T02:30:00Z')).toBe('28/2/26 23:30');
		expect(argDateLog('2026-10-02T13:43:00-03:00', { time: false })).toBe('2/10/26');
		expect(argDateLog('no es una fecha')).toBe('');
	});
});

// es-AR in recent ICU/CLDR data (Node 22+, current browsers) defaults to a 12-hour clock
// («10:00 p. m.»); the site always shows 24-hour Argentina time.
describe('argFormat', () => {
	const night = new Date('2026-10-11T01:00:00Z'); // 22:00 of the 10th in Argentina
	const NO_AMPM = /[ap]\.\s?m\.|AM|PM/i;

	it('always uses a 24-hour clock', () => {
		expect(argFormat({ hour: '2-digit', minute: '2-digit' }).format(night)).toBe('22:00');
		expect(argFormat({ hour: '2-digit' }).resolvedOptions().hourCycle).toBe('h23');
		expect(argFormat({ timeStyle: 'short' }).resolvedOptions().hourCycle).toBe('h23');
	});

	it('midnight is 00, not 12 or 24', () => {
		const midnight = new Date('2026-10-11T03:05:00Z');
		expect(argFormat({ hour: '2-digit', minute: '2-digit' }).format(midnight)).toBe('00:05');
	});

	it('keeps 24 h with dateStyle/timeStyle and with weekday/day/month fields', () => {
		for (const opts of /** @type {Intl.DateTimeFormatOptions[]} */ ([
			{ dateStyle: 'full', timeStyle: 'short' },
			{ dateStyle: 'short', timeStyle: 'short' },
			{ weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
			{ hour: 'numeric', minute: 'numeric', second: 'numeric' }
		])) {
			const out = argFormat(opts).format(night);
			expect(out).toContain('22:00');
			expect(out).not.toMatch(NO_AMPM);
		}
	});

	it('ignores hour12 (which would override hourCycle)', () => {
		expect(argFormat({ hour: '2-digit', minute: '2-digit', hour12: true }).format(night)).toBe(
			'22:00'
		);
	});

	it('uses Argentina time by default, but a timeZone can be passed', () => {
		expect(argFormat({ day: 'numeric' }).format(night)).toBe('10');
		expect(argFormat({ timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }).format(night)).toBe(
			'01:00'
		);
	});
});

// 23:30 del sábado 12/9 en Argentina ya es el domingo 13 en UTC: todas tienen que decir el 12.
const LATE = '2026-09-12T23:30:00-03:00';

describe('variantes: corta, larga, día/mes, partes y CSV', () => {
	it('argDateShort: «12 sep 2026» (nunca «sept»)', () => {
		expect(argDateShort(LATE)).toBe('12 sep 2026');
		expect(argDateShort(Date.UTC(2026, 0, 5, 15))).toBe('5 ene 2026');
	});

	it('argDateLong: «12 de septiembre de 2026», sin el año si se pide', () => {
		expect(argDateLong(LATE)).toBe('12 de septiembre de 2026');
		expect(argDateLong(LATE, { year: false })).toBe('12 de septiembre');
	});

	it('argDayMonth: «12/9»', () => {
		expect(argDayMonth(LATE)).toBe('12/9');
		expect(argDayMonth('2099-10-06T01:00Z')).toBe('5/10');
	});

	it('argDateTimeCsv: «2026-10-02 22:30» en hora de Argentina', () => {
		expect(argDateTimeCsv(Date.UTC(2026, 9, 3, 1, 30))).toBe('2026-10-02 22:30');
		expect(argDateTimeCsv(new Date('2026-01-05T09:05:00-03:00'))).toBe('2026-01-05 09:05');
	});

	it('argDateParts: las partes sueltas en hora de Argentina', () => {
		expect(argDateParts(LATE)).toEqual({
			weekday: 'sáb',
			weekdayLong: 'sábado',
			day: 12,
			month: 'sep',
			monthLong: 'septiembre',
			year: 2026,
			hours: 23,
			minutes: 30
		});
		expect(argDateParts('no')).toBeNull();
	});

	it('sin fecha o ilegible: vacío (no «31 de diciembre de 1969»)', () => {
		for (const fn of [argDateShort, argDateLong, argDayMonth, argDateTimeCsv]) {
			expect(fn(null)).toBe('');
			expect(fn(undefined)).toBe('');
			expect(fn('')).toBe('');
			expect(fn('no es una fecha')).toBe('');
		}
	});
});

describe('eventDateList (fecha de un evento como la escribe el sitio)', () => {
	it('con hora: la hora como está escrita', () => {
		expect(eventDateList('2026-09-12T23:30-03:00')).toBe('sáb 12 sep · 23:30');
		expect(eventDateList('2026-10-02 9:05')).toBe('vie 2 oct · 09:05');
	});

	it('sin hora: solo el día', () => {
		expect(eventDateList('2026-10-03')).toBe('sáb 3 oct');
	});

	it('el año solo si no es el de `now`', () => {
		expect(eventDateList('2025-10-03T22:00-03:00', { now: '2026-01-01T12:00-03:00' })).toBe(
			'vie 3 oct 2025 · 22:00'
		);
		expect(eventDateList('2025-10-03T22:00-03:00')).toBe('vie 3 oct · 22:00');
	});

	it('un Date se lee en hora de Argentina', () => {
		expect(eventDateList(new Date(LATE))).toBe('sáb 12 sep · 23:30');
	});

	it('ilegible: vacío', () => {
		expect(eventDateList('')).toBe('');
		expect(eventDateList(null)).toBe('');
		expect(eventDateList('cualquier cosa')).toBe('');
		expect(eventDateList('2026-13-45')).toBe('');
	});
});

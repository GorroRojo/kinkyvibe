import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	calendarDayFlags,
	calendarMonthHref,
	currentMonth,
	defaultCalendarMonth,
	isCurrent,
	isLinkedCalendarMonth,
	monthCountLabel,
	monthHasPastEvents,
	shiftCalendarMonth
} from './allPosts.js';

/** @param {Record<string, any>} meta */
const post = (meta) => /** @type {ProcessedPost} */ (/** @type {unknown} */ ({ meta, path: '/x' }));

describe('isCurrent', () => {
	const now = Date.parse('2026-09-30T12:00:00-03:00');

	it('keeps events that have not started yet', () => {
		expect(isCurrent(post({ category: 'calendario', start: '2026-09-30T19:00-03:00' }), now)).toBe(
			true
		);
	});

	it('drops events that already started (even if they are still running)', () => {
		expect(isCurrent(post({ category: 'calendario', start: '2026-09-30T11:00-03:00' }), now)).toBe(
			false
		);
		expect(isCurrent(post({ category: 'calendario', start: '2026-09-30T12:00-03:00' }), now)).toBe(
			false
		);
	});

	it('drops events with a missing or invalid start', () => {
		expect(isCurrent(post({ category: 'calendario' }), now)).toBe(false);
		expect(isCurrent(post({ category: 'calendario', start: 'pronto' }), now)).toBe(false);
	});

	it('always keeps posts that are not events', () => {
		expect(isCurrent(post({ category: 'material', published_date: '2020-01-01' }), now)).toBe(true);
		expect(isCurrent(post({ category: 'amigues' }), now)).toBe(true);
	});
});

describe('fetchAllPostsClient', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.resetModules();
	});

	// the module caches the request, so each test gets a fresh copy
	const load = async () => (await import('./allPosts.js')).fetchAllPostsClient;

	it('fetches /api/posts once and shares the result', async () => {
		const posts = [{ meta: { title: 'a' }, path: '/a' }];
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(posts)));
		vi.stubGlobal('fetch', fetchMock);
		const fetchAllPostsClient = await load();
		const [a, b] = await Promise.all([fetchAllPostsClient(), fetchAllPostsClient()]);
		expect(a).toEqual(posts);
		expect(b).toBe(a);
		expect(await fetchAllPostsClient()).toBe(a);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/api/posts');
	});

	it('rejects on a non-OK response and retries on the next call', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response('nope', { status: 503 }))
			.mockResolvedValueOnce(new Response('[]'));
		vi.stubGlobal('fetch', fetchMock);
		const fetchAllPostsClient = await load();
		await expect(fetchAllPostsClient()).rejects.toThrow('503');
		expect(await fetchAllPostsClient()).toEqual([]);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('retries after a network error too', async () => {
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(new TypeError('offline'))
			.mockResolvedValueOnce(new Response('[]'));
		vi.stubGlobal('fetch', fetchMock);
		const fetchAllPostsClient = await load();
		await expect(fetchAllPostsClient()).rejects.toThrow('offline');
		expect(await fetchAllPostsClient()).toEqual([]);
	});
});

describe('monthHasPastEvents', () => {
	const now = Date.parse('2026-10-04T12:00:00-03:00');
	const event = (/** @type {string} */ start) => post({ category: 'calendario', start });

	it('is true when an event of that month already started', () => {
		const posts = [event('2026-10-03T15:30-03:00'), event('2026-10-30T16:00-03:00')];
		expect(monthHasPastEvents(posts, '2026-10', now)).toBe(true);
		expect(monthHasPastEvents(posts, '2026-09', now)).toBe(false);
	});

	it('is false when every event of that month is still to come', () => {
		expect(monthHasPastEvents([event('2026-10-30T16:00-03:00')], '2026-10', now)).toBe(false);
		expect(monthHasPastEvents([event('2026-11-07T20:00-03:00')], '2026-11', now)).toBe(false);
	});

	it('is false for an empty month', () => {
		expect(monthHasPastEvents([event('2026-09-12T20:00-03:00')], '2026-08', now)).toBe(false);
		expect(monthHasPastEvents([], '2026-10', now)).toBe(false);
	});

	it('groups by the month in Argentina, not in UTC', () => {
		// 30/9 22:00 in Buenos Aires is already 1/10 in UTC.
		const posts = [event('2026-09-30T22:00-03:00')];
		expect(monthHasPastEvents(posts, '2026-09', now)).toBe(true);
		expect(monthHasPastEvents(posts, '2026-10', now)).toBe(false);
	});

	it('ignores posts that are not events and events without a valid start', () => {
		const posts = [
			post({ category: 'material', start: '2026-10-01T10:00-03:00' }),
			post({ category: 'calendario' }),
			post({ category: 'calendario', start: 'pronto' })
		];
		expect(monthHasPastEvents(posts, '2026-10', now)).toBe(false);
	});
});

describe('monthCountLabel', () => {
	const now = Date.parse('2026-10-04T15:00:00Z');
	it('says the month and how many events, with the year only if it is not this one', () => {
		expect(monthCountLabel('2026-10', 7, now)).toBe('Octubre · 7 eventos');
		expect(monthCountLabel('2026-11', 1, now)).toBe('Noviembre · 1 evento');
		expect(monthCountLabel('2027-01', 0, now)).toBe('Enero 2027 · 0 eventos');
	});
});

// «Hoy» en /calendario es el de Argentina (UTC−3 todo el año), no el del servidor (UTC) ni el del
// navegador. Las pruebas pasan por la medianoche de un lado y del otro.
describe('calendarDayFlags', () => {
	it('at 01:30 UTC it is still the previous day in Argentina', () => {
		const now = Date.parse('2026-10-12T01:30:00Z'); // 11/10 22:30 en Argentina
		expect(calendarDayFlags('2026-10-11', now)).toEqual({ today: true, past: false });
		expect(calendarDayFlags('2026-10-12', now)).toEqual({ today: false, past: false });
		expect(calendarDayFlags('2026-10-10', now)).toEqual({ today: false, past: true });
	});

	it('at 23:30 in Argentina it is already the next day in UTC, but today stays put', () => {
		const now = Date.parse('2026-10-11T23:30:00-03:00'); // 12/10 02:30 UTC
		expect(calendarDayFlags('2026-10-11', now).today).toBe(true);
		expect(calendarDayFlags('2026-10-12', now).today).toBe(false);
	});

	it('from 21:00 to 23:59 in Argentina (already tomorrow in UTC) today is still today', () => {
		for (const time of ['21:00:00', '22:15:00', '23:59:59']) {
			const now = Date.parse(`2026-12-31T${time}-03:00`);
			expect(new Date(now).toISOString().slice(0, 10)).toBe('2027-01-01');
			expect(calendarDayFlags('2026-12-31', now)).toEqual({ today: true, past: false });
			expect(calendarDayFlags('2027-01-01', now)).toEqual({ today: false, past: false });
			expect(currentMonth(now)).toBe('2026-12');
		}
	});

	it('turns over exactly at midnight in Argentina (03:00 UTC)', () => {
		expect(calendarDayFlags('2026-10-12', Date.parse('2026-10-12T02:59:59Z')).today).toBe(false);
		expect(calendarDayFlags('2026-10-12', Date.parse('2026-10-12T03:00:00Z')).today).toBe(true);
		expect(calendarDayFlags('2026-10-11', Date.parse('2026-10-12T03:00:00Z')).past).toBe(true);
	});
});

describe('currentMonth and shiftCalendarMonth', () => {
	it('uses the month in Argentina around a month change', () => {
		// 1/11 01:30 UTC = 31/10 22:30 en Argentina.
		expect(currentMonth(Date.parse('2026-11-01T01:30:00Z'))).toBe('2026-10');
		expect(currentMonth(Date.parse('2026-11-01T03:00:00Z'))).toBe('2026-11');
	});

	it('moves across years both ways', () => {
		expect(shiftCalendarMonth('2026-12', 1)).toBe('2027-01');
		expect(shiftCalendarMonth('2026-01', -1)).toBe('2025-12');
		expect(shiftCalendarMonth('2026-10', 0)).toBe('2026-10');
	});
});

describe('defaultCalendarMonth', () => {
	/** @param {string} start */
	const ev = (start) => post({ category: 'calendario', start });

	it('stays on this month (in Argentina) while it has an upcoming event', () => {
		// 31/10 23:00 en Argentina, ya 1/11 en UTC: el evento de las 23:30 todavía no empezó.
		const now = Date.parse('2026-10-31T23:00:00-03:00');
		const days = { '2026-10-31': [ev('2026-10-31T23:30-03:00')] };
		expect(defaultCalendarMonth(days, now)).toBe('2026-10');
	});

	it('opens on next month when every event of this month already started', () => {
		const now = Date.parse('2026-10-31T23:00:00-03:00');
		const days = {
			'2026-10-31': [ev('2026-10-31T20:00-03:00')],
			'2026-11-07': [ev('2026-11-07T22:00-03:00')]
		};
		expect(defaultCalendarMonth(days, now)).toBe('2026-11');
	});

	it('ignores events with an invalid start', () => {
		const now = Date.parse('2026-10-15T12:00:00-03:00');
		expect(defaultCalendarMonth({ '2026-10-20': [ev('mal')] }, now)).toBe('2026-11');
	});
});

describe('calendarMonthHref', () => {
	const url = new URL('https://kinkyvibe.ar/calendario?viewdate=2026-05&otro=1#postlist');
	it('pone ?viewdate, conserva lo demás y saca el ancla', () => {
		expect(calendarMonthHref(url, '2026-06', '2026-10')).toBe(
			'/calendario?viewdate=2026-06&otro=1'
		);
	});
	it('el mes con el que abre igual va sin ?viewdate', () => {
		expect(calendarMonthHref(url, '2026-10', '2026-10')).toBe('/calendario?otro=1');
	});
});

describe('isLinkedCalendarMonth', () => {
	it('solo entre el mes del primer evento y el del último (incluidos)', () => {
		expect(isLinkedCalendarMonth('2023-06', '2023-06', '2026-12')).toBe(true);
		expect(isLinkedCalendarMonth('2026-12', '2023-06', '2026-12')).toBe(true);
		expect(isLinkedCalendarMonth('2023-05', '2023-06', '2026-12')).toBe(false);
		expect(isLinkedCalendarMonth('2027-01', '2023-06', '2026-12')).toBe(false);
		expect(isLinkedCalendarMonth('1998-12', '2023-06', '2026-12')).toBe(false);
	});
	it('sin eventos con fecha: ninguno', () => {
		expect(isLinkedCalendarMonth('2026-10', null, null)).toBe(false);
		expect(isLinkedCalendarMonth('2026-10', undefined, '2026-12')).toBe(false);
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCurrent, monthCountLabel, monthHasPastEvents } from './allPosts.js';

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

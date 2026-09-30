import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCurrent } from './allPosts.js';

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

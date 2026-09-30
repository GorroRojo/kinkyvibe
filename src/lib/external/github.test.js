import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSafeEndpoint, ghGet, ghPut } from './github.js';

afterEach(() => vi.unstubAllGlobals());

describe('assertSafeEndpoint', () => {
	it('accepts plain API paths', () => {
		expect(() => assertSafeEndpoint('user')).not.toThrow();
		expect(() =>
			assertSafeEndpoint('repos/GorroRojo/kinkyvibe/contents/src/lib/posts/amigues/a.b_c-d.md')
		).not.toThrow();
	});
	it('rejects dot segments, queries, encodings and empty segments', () => {
		for (const bad of [
			'',
			'/user',
			'user/',
			'a//b',
			'a/./b',
			'a/../b',
			'..',
			'a/%2e%2e/b',
			'a%2Fb',
			'user?x=1',
			'user#x',
			'a\\b',
			'a b'
		]) {
			expect(() => assertSafeEndpoint(bad), bad).toThrow();
		}
	});
	it('ghGet and ghPut refuse unsafe endpoints before any request', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		await expect(ghGet('repos/x/../../user', 't')).rejects.toThrow();
		await expect(ghPut('repos/x/contents/a.md?y', 't', 'body', 'sha')).rejects.toThrow();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

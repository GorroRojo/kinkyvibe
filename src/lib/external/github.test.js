import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSafeEndpoint, ghGet, ghPut } from './github.js';
import { Buffer } from 'node:buffer';

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
	it('ghPut sends the text as UTF-8 base64', async () => {
		const fetchMock = vi.fn(async () => new Response('{}'));
		vi.stubGlobal('fetch', fetchMock);
		const text = 'ñandú 🏙️\n';
		await ghPut('repos/GorroRojo/kinkyvibe/contents/src/lib/posts/wiki/a.md', 't', text, 's');
		const init = /** @type {any} */ (fetchMock.mock.calls[0])[1];
		const sent = JSON.parse(init.body);
		expect(sent.content).toBe(Buffer.from(text, 'utf-8').toString('base64'));
		expect(sent.sha).toBe('s');
	});
});

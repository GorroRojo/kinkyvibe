import { afterEach, describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server.js';

const locals = {
	user: { id: 4594048, login: 'GorroRojo', name: null, avatar_url: '' },
	user_token: 't'
};
const url = new URL('https://kinkyvibe.ar/edit/calendario/x');

afterEach(() => vi.unstubAllGlobals());

/**
 * @param {() => any} fn
 * @returns {Promise<any>}
 */
async function rejection(fn) {
	try {
		await fn();
	} catch (/** @type {any} */ e) {
		return e;
	}
	throw new Error('did not throw');
}

describe('post editor input validation', () => {
	it('load refuses post ids that are not plain file names, without calling GitHub', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		for (const postID of ['../../x', 'a/b', 'x?y', '..', '.env']) {
			const e = await rejection(() =>
				load(/** @type {any} */ ({ locals, url, params: { category: 'calendario', postID } }))
			);
			expect(e.status, postID).toBe(400);
		}
		const e = await rejection(() =>
			load(/** @type {any} */ ({ locals, url, params: { category: 'media', postID: 'x' } }))
		);
		expect(e.status).toBe(400);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('the load action validates category and path too', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		for (const [category, path] of [
			['calendario', '../../../x'],
			['../..', 'x'],
			[null, 'x'],
			['calendario', null]
		]) {
			const body = new FormData();
			if (category !== null) body.set('category', category);
			if (path !== null) body.set('path', path);
			const request = new Request('https://kinkyvibe.ar/edit/calendario/x?/load', {
				method: 'POST',
				body
			});
			const r = await actions.load(/** @type {any} */ ({ locals, url, request }));
			expect(r?.status).toBe(400);
		}
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('a valid post is fetched from the site repo', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ content: btoa('hola'), encoding: 'base64', sha: 's' }))
		);
		vi.stubGlobal('fetch', fetchMock);
		const body = new FormData();
		body.set('category', 'calendario');
		body.set('path', 'fiesta');
		const request = new Request('https://kinkyvibe.ar/edit/calendario/x?/load', {
			method: 'POST',
			body
		});
		const r = /** @type {any} */ (
			await actions.load(/** @type {any} */ ({ locals, url, request }))
		);
		expect(r.post.raw).toBe('hola');
		expect(/** @type {any} */ (fetchMock.mock.calls[0])[0]).toBe(
			'https://api.github.com/repos/GorroRojo/kinkyvibe/contents/src/lib/posts/calendario/fiesta.md'
		);
	});
});

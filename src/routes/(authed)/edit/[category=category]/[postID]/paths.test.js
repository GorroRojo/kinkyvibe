import { afterEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server.js';
import { utf8ToBase64 } from '$lib/utils/base64.js';

// The pickers' data (tag usage, profiles, authors) is not what these tests are about.
vi.mock('$lib/server/admin/content.js', () => ({
	editorData: async () => ({ tagUsage: {}, profiles: [], authorUsage: {} })
}));

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

	it('events and material are read only from the database: without it, 404 (GitHub is never asked)', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const e = await rejection(() =>
			load(
				/** @type {any} */ ({
					locals,
					url: new URL('https://kinkyvibe.ar/edit/material/fiesta'),
					params: { category: 'material', postID: 'fiesta' }
				})
			)
		);
		expect(e.status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	// Amigues (and the wiki) still live in the repo.
	it('a valid post is fetched from the site repo and decoded as UTF-8', async () => {
		// The editor reads the newest saved version: first the open content PRs (none here), then
		// the file on main.
		const text = '---\ntitle: Año 🏙️\n---\n\nñandú y amigues 🎉\n';
		const fetchMock = vi.fn(async (/** @type {string} */ u) =>
			u.includes('/pulls?')
				? new Response('[]')
				: new Response(
						JSON.stringify({
							type: 'file',
							content: utf8ToBase64(text),
							encoding: 'base64',
							sha: 's'
						})
					)
		);
		vi.stubGlobal('fetch', fetchMock);
		const r = /** @type {any} */ (
			await load(
				/** @type {any} */ ({
					locals,
					url: new URL('https://kinkyvibe.ar/edit/amigues/fiesta'),
					params: { category: 'amigues', postID: 'fiesta' }
				})
			)
		);
		expect(r.post.raw).toBe(text);
		expect(r.post.sha).toBe('s');
		expect(fetchMock.mock.calls.map((c) => /** @type {any} */ (c)[0])).toContain(
			'https://api.github.com/repos/GorroRojo/kinkyvibe/contents/src/lib/posts/amigues/fiesta.md?ref=main'
		);
	});

	it('a file GitHub sends without base64 content (over 1 MB) is an error, not an empty post', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (/** @type {string} */ u) =>
				u.includes('/pulls?')
					? new Response('[]')
					: new Response(JSON.stringify({ type: 'file', content: '', encoding: 'none', sha: 's' }))
			)
		);
		const e = await rejection(() =>
			load(
				/** @type {any} */ ({
					locals,
					url: new URL('https://kinkyvibe.ar/edit/amigues/fiesta'),
					params: { category: 'amigues', postID: 'fiesta' }
				})
			)
		);
		expect(e.status).toBe(502);
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { load } from './+page.server.js';

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

	// «Solo base»: amigues and the wiki moved to the database too, with their own editors in the
	// panel. The tests that read an amigues .md from GitHub here went with that mode (nothing in this
	// editor reads posts from GitHub any more).
	it('amigues and wiki addresses go to their panel editors, without calling GitHub', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const amigues = await rejection(() =>
			load(
				/** @type {any} */ ({
					locals,
					url: new URL('https://kinkyvibe.ar/edit/amigues/Ficha_Inventada'),
					params: { category: 'amigues', postID: 'Ficha_Inventada' }
				})
			)
		);
		expect(amigues).toMatchObject({
			status: 303,
			location: '/admin/comunidad/perfiles/Ficha_Inventada'
		});
		const wiki = await rejection(() =>
			load(
				/** @type {any} */ ({
					locals,
					url: new URL('https://kinkyvibe.ar/edit/wiki/termino-inventado'),
					params: { category: 'wiki', postID: 'termino-inventado' }
				})
			)
		);
		expect(wiki).toMatchObject({
			status: 303,
			location: '/admin/etiquetas/wiki/termino-inventado'
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

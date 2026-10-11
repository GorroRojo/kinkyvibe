import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
	contentCommitMessage,
	contentPath,
	gitBlobSha,
	planContentSave,
	readContentPost,
	saveContentPost
} from './posts.js';

const POST = '---\ntitle: Hola\nfeatured: 1\n---\nCuerpo\n';

/** @param {{files?: Record<string, string>}} opts */
function fakeClient({ files = {} } = {}) {
	/** @type {any[]} */
	const commits = [];
	return {
		commits,
		/** @param {string} _t @param {string} path */
		getFile: async (_t, path) => files[path] ?? null,
		/** @param {string} _t @param {any} opts */
		commitFiles: async (_t, opts) => {
			commits.push(opts);
			return { sha: 'abc', url: 'https://example.com/commit/abc' };
		}
	};
}

describe('gitBlobSha', () => {
	it('is git hash-object of the text (utf-8 bytes)', async () => {
		for (const text of ['', 'hola\n', 'ñandú 🎉\n']) {
			const bytes = Buffer.from(text, 'utf-8');
			const expected = createHash('sha1')
				.update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
				.digest('hex');
			expect(await gitBlobSha(text)).toBe(expected);
		}
	});
});

describe('contentPath', () => {
	it('only material and amigues, only safe slugs', () => {
		expect(contentPath('material', 'guia')).toBe('src/lib/posts/material/guia.md');
		expect(contentPath('amigues', 'la.colectiver')).toBe('src/lib/posts/amigues/la.colectiver.md');
		expect(contentPath('calendario', 'x')).toBeNull();
		expect(contentPath('material', '../x')).toBeNull();
	});
});

describe('readContentPost', () => {
	it('returns the text and its blob sha, or null', async () => {
		const client = fakeClient({ files: { 'src/lib/posts/material/a.md': POST } });
		const r = await readContentPost(/** @type {any} */ (client), 't', 'material', 'a');
		expect(r?.raw).toBe(POST);
		expect(r?.sha).toBe(await gitBlobSha(POST));
		expect(await readContentPost(/** @type {any} */ (client), 't', 'material', 'b')).toBeNull();
		expect(await readContentPost(/** @type {any} */ (client), 't', 'wiki', 'a')).toBeNull();
	});
});

describe('planContentSave / saveContentPost', () => {
	// Ya no se sube ninguna imagen al repo (decisión 0032): un guardado es solo el texto, y la imagen
	// de la biblioteca va como edge `portada`.
	it('new post: must not exist, one file', () => {
		const plan = planContentSave({
			category: 'material',
			slug: 'zine',
			content: '---\ntitle: Z\n---\n',
			isNew: true
		});
		expect(plan.mustNotExist).toEqual(['src/lib/posts/material/zine.md']);
		expect(plan.unchanged).toEqual([]);
		expect(plan.files).toEqual([
			{ path: 'src/lib/posts/material/zine.md', content: '---\ntitle: Z\n---\n' }
		]);
	});

	it('edit: guarded by the sha read; the library image goes as an edge', async () => {
		const client = fakeClient();
		await saveContentPost(/** @type {any} */ (client), 't', {
			category: 'material',
			slug: 'a',
			content: POST,
			isNew: false,
			baseSha: 'sha-leido',
			message: 'msg',
			edges: { portada: [7] }
		});
		expect(client.commits).toHaveLength(1);
		const c = client.commits[0];
		expect(c.message).toBe('msg');
		expect(c.unchanged).toEqual([{ path: 'src/lib/posts/material/a.md', sha: 'sha-leido' }]);
		expect(c.mustNotExist).toEqual([]);
		expect(c.edges).toEqual({ 'src/lib/posts/material/a.md': { portada: [7] } });
	});

	it('edit without image: one file', async () => {
		const client = fakeClient();
		await saveContentPost(/** @type {any} */ (client), 't', {
			category: 'material',
			slug: 'a',
			content: POST,
			isNew: false,
			baseSha: 's',
			message: 'm'
		});
		expect(client.commits[0].files).toEqual([
			{ path: 'src/lib/posts/material/a.md', content: POST }
		]);
		expect(client.commits[0].mustNotExist).toEqual([]);
	});

	it('refuses invalid paths', () => {
		expect(() =>
			planContentSave({
				category: 'calendario',
				slug: 'x',
				content: POST,
				isNew: true
			})
		).toThrow(/inválida/);
	});
});

describe('contentCommitMessage', () => {
	it('says who did what', () => {
		expect(
			contentCommitMessage({ who: 'gorrite', verb: 'created', category: 'material', slug: 'zine' })
		).toBe('[admin] gorrite created material/zine');
		expect(
			contentCommitMessage({
				who: 'x',
				verb: 'duplicated',
				category: 'material',
				slug: 'b',
				from: 'a'
			})
		).toBe('[admin] x duplicated material/b (desde material/a)');
	});
});

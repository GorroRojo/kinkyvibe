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

/** @param {{files?: Record<string, string>, media?: string[]}} opts */
function fakeClient({ files = {}, media = [] } = {}) {
	/** @type {any[]} */
	const commits = [];
	return {
		commits,
		/** @param {string} _t @param {string} path */
		getFile: async (_t, path) => files[path] ?? null,
		/** @param {string} _t @param {string} _dir */
		listDir: async (_t, _dir) =>
			media.map((name) => ({ name, path: name, sha: 'x', type: 'file' })),
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
	it('new post: must not exist, image as 1.<ext>', async () => {
		const client = fakeClient();
		const plan = await planContentSave(/** @type {any} */ (client), 't', {
			category: 'material',
			slug: 'zine',
			content: '---\ntitle: Z\n#featured: 1\n---\n',
			isNew: true,
			image: { base64: 'AAAA', ext: 'webp' }
		});
		expect(plan.mustNotExist).toEqual([
			'src/lib/posts/material/zine.md',
			'src/lib/posts/material/media/zine/1.webp'
		]);
		expect(plan.unchanged).toEqual([]);
		expect(plan.files[0].content).toContain('featured: 1');
		expect(plan.files[0].content).not.toContain('#featured');
		expect(plan.files[1]).toEqual({
			path: 'src/lib/posts/material/media/zine/1.webp',
			base64: 'AAAA'
		});
	});

	it('edit: guarded by the sha read, next free image number', async () => {
		const client = fakeClient({ media: ['1.webp', '2.png', 'spoiler.webp'] });
		const r = await saveContentPost(/** @type {any} */ (client), 't', {
			category: 'amigues',
			slug: 'Perfil',
			content: POST,
			isNew: false,
			baseSha: 'sha-leido',
			image: { base64: 'BBBB', ext: 'jpg' },
			message: 'msg'
		});
		expect(client.commits).toHaveLength(1);
		const c = client.commits[0];
		expect(c.message).toBe('msg');
		expect(c.unchanged).toEqual([{ path: 'src/lib/posts/amigues/Perfil.md', sha: 'sha-leido' }]);
		expect(c.mustNotExist).toEqual(['src/lib/posts/amigues/media/Perfil/3.jpg']);
		expect(c.files[0].content).toContain('featured: 3');
		expect(r.imagePath).toBe('src/lib/posts/amigues/media/Perfil/3.jpg');
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

	it('refuses invalid paths', async () => {
		await expect(
			planContentSave(/** @type {any} */ (fakeClient()), 't', {
				category: 'calendario',
				slug: 'x',
				content: POST,
				isNew: true
			})
		).rejects.toThrow(/inválida/);
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
				from: 'a',
				image: true
			})
		).toBe('[admin] x duplicated material/b (desde material/a, imagen nueva)');
	});
});

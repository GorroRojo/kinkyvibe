import { describe, it, expect } from 'vitest';
import {
	TAGS_PATH,
	commitTagEdit,
	planTagEdit,
	previewOf,
	readTagSource,
	tagCommitMessage,
	touchesPosts
} from './tagEditor.js';
import { gitBlobSha } from './posts.js';

const SRC = `export const hardcodedTags = [
	{ id: 'root', children: ['bondage'] },
	{ id: 'bondage', children: ['shibari'] },
	{ id: 'bdsm', aliasOf: 'BDSM' }
];
export default hardcodedTags;
`;

/** @param {{source?: string | null}} [opts] */
function fakeClient({ source = SRC } = {}) {
	/** @type {any[]} */
	const commits = [];
	/** @type {string[]} */
	const dirReads = [];
	return {
		commits,
		dirReads,
		/** @param {string} _t @param {string} path */
		getFile: async (_t, path) => (path === TAGS_PATH ? source : null),
		/** @param {string} _t @param {string} dir */
		getDirTexts: async (_t, dir) => {
			dirReads.push(dir);
			if (dir.endsWith('/material'))
				return [
					{ path: `${dir}/a.md`, sha: 'sa', text: '---\ntags:\n  - bondage\n---\n' },
					{ path: `${dir}/_post_template.md`, sha: 'st', text: '---\ntags:\n  - bondage\n---\n' },
					{ path: `${dir}/b.md`, sha: 'sb', text: '---\ntags:\n  - otra\n---\n' }
				];
			return [];
		},
		/** @param {string} _t @param {any} opts */
		commitFiles: async (_t, opts) => {
			commits.push(opts);
			return { sha: 'c', url: 'https://example.com/c' };
		}
	};
}

describe('readTagSource', () => {
	it('reads the repo copy with its sha, or falls back to the bundled one', async () => {
		const r = await readTagSource(/** @type {any} */ (fakeClient()), 't', 'bundled');
		expect(r).toEqual({ source: SRC, sha: await gitBlobSha(SRC), fromRepo: true });
		const d = await readTagSource(/** @type {any} */ (fakeClient({ source: null })), 't', SRC);
		expect(d).toEqual({ source: SRC, sha: undefined, fromRepo: false });
	});
});

describe('planTagEdit / commitTagEdit', () => {
	it('reads posts only for rename/merge, skips templates, commits once with shas', async () => {
		const client = fakeClient();
		const move = await planTagEdit(
			/** @type {any} */ (client),
			't',
			[{ type: 'create', id: 'x', parent: 'root' }],
			SRC
		);
		expect(client.dirReads).toEqual([]);
		expect(move.files.map((f) => f.path)).toEqual([TAGS_PATH]);
		expect(touchesPosts([{ type: 'merge', from: 'a', into: 'b' }])).toBe(true);

		const plan = await planTagEdit(
			/** @type {any} */ (client),
			't',
			[{ type: 'rename', from: 'bondage', to: 'cuerdas' }],
			SRC
		);
		expect(client.dirReads).toHaveLength(4);
		expect(plan.files.map((f) => f.path)).toEqual([TAGS_PATH, 'src/lib/posts/material/a.md']);
		await commitTagEdit(/** @type {any} */ (client), 't', plan, 'gorrite');
		const c = client.commits[0];
		expect(c.files).toHaveLength(2);
		expect(c.files[1].content).toBe('---\ntags:\n  - cuerdas\n---\n');
		expect(c.unchanged).toEqual([
			{ path: TAGS_PATH, sha: await gitBlobSha(SRC) },
			{ path: 'src/lib/posts/material/a.md', sha: 'sa' }
		]);
		expect(c.message.split('\n')[0]).toBe(
			'[admin] gorrite: etiquetas: Renombrar «bondage» a «cuerdas» (el nombre viejo queda como alias)'
		);
	});
	it('refuses a plan that changes nothing', async () => {
		await expect(
			commitTagEdit(/** @type {any} */ (fakeClient()), 't', { files: [], summary: [] }, 'x')
		).rejects.toThrow(/ningún archivo/);
	});
});

describe('previewOf / tagCommitMessage', () => {
	it('summarizes diffs per file', async () => {
		const plan = await planTagEdit(
			/** @type {any} */ (fakeClient()),
			't',
			[{ type: 'rename', from: 'bondage', to: 'cuerdas' }],
			SRC
		);
		const p = previewOf(plan);
		expect(p.total).toBe(2);
		expect(p.files[1]).toMatchObject({
			path: 'src/lib/posts/material/a.md',
			added: 1,
			removed: 1,
			more: 0
		});
		expect(previewOf(plan, { maxFiles: 1 }).files).toHaveLength(1);
	});
	it('lists every operation', () => {
		expect(tagCommitMessage('x', ['A', 'B'], 3)).toBe(
			'[admin] x: etiquetas: A (+1)\n\n- A\n- B\n\n3 archivo(s).'
		);
	});
});

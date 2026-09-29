import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	commitFiles,
	existingPaths,
	getDirTexts,
	listTree,
	FileChangedError,
	PathExistsError,
	GitHubError
} from './github.js';

/** @type {Array<{method: string, url: string, body: any}>} */
let calls;
/** @type {(method: string, endpoint: string, body: any) => {status: number, json?: any}} */
let respond;
const realFetch = globalThis.fetch;

beforeEach(() => {
	calls = [];
	// @ts-ignore
	globalThis.fetch = async (/** @type {string} */ url, /** @type {any} */ init) => {
		const endpoint = url.replace('https://api.github.com/repos/GorroRojo/kinkyvibe/', '');
		const body = init.body ? JSON.parse(init.body) : undefined;
		calls.push({ method: init.method, url: endpoint, body });
		const r = respond(init.method, endpoint, body);
		return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status });
	};
});
afterEach(() => {
	globalThis.fetch = realFetch;
});

const DIR = 'src/lib/posts/calendario';

describe('listTree / existingPaths', () => {
	it('lists a directory at a ref and treats 404 as empty', async () => {
		respond = (m, e) =>
			e.startsWith('git/trees/abc%3A') || e.startsWith('git/trees/abc:')
				? { status: 200, json: { tree: [{ path: 'a.md', sha: '1', type: 'blob' }] } }
				: { status: 404, json: { message: 'Not Found' } };
		expect(await listTree('t', DIR, { ref: 'abc' })).toEqual([
			{ path: 'a.md', sha: '1', type: 'blob' }
		]);
		expect(calls[0].url).toBe(`git/trees/abc:${DIR}`);
		expect(await listTree('t', 'nope', { ref: 'zzz' })).toEqual([]);
	});
	it('checks many paths with one request per directory', async () => {
		respond = (m, e) => {
			if (e === `git/trees/h:${DIR}`)
				return { status: 200, json: { tree: [{ path: 'x-2026-10.md' }, { path: 'media' }] } };
			if (e === `git/trees/h:${DIR}/media`)
				return { status: 200, json: { tree: [{ path: 'y-2026-10' }] } };
			return { status: 500 };
		};
		const found = await existingPaths(
			't',
			[
				`${DIR}/x-2026-10.md`,
				`${DIR}/y-2026-10.md`,
				`${DIR}/z.md`,
				`${DIR}/media/x-2026-10`,
				`${DIR}/media/y-2026-10`
			],
			'h'
		);
		expect(found).toEqual([`${DIR}/x-2026-10.md`, `${DIR}/media/y-2026-10`]);
		expect(calls).toHaveLength(2);
	});
});

describe('commitFiles', () => {
	/** @param {{moved?: number, exists?: string[]}} opts */
	const fakeRepo = ({ moved = 0, exists = [] } = {}) => {
		let patches = 0;
		respond = (m, e, body) => {
			if (m === 'POST' && e === 'git/blobs')
				return { status: 201, json: { sha: 'blob-' + body.content.length } };
			if (m === 'GET' && e === 'git/ref/heads/main')
				return { status: 200, json: { object: { sha: 'head' + patches } } };
			if (m === 'GET' && e.startsWith('git/trees/'))
				return { status: 200, json: { tree: exists.map((p) => ({ path: p })) } };
			if (m === 'GET' && e.startsWith('git/commits/'))
				return { status: 200, json: { tree: { sha: 'tree0' } } };
			if (m === 'POST' && e === 'git/trees') return { status: 201, json: { sha: 'tree1' } };
			if (m === 'POST' && e === 'git/commits')
				return { status: 201, json: { sha: 'commit' + patches } };
			if (m === 'PATCH') {
				patches++;
				return patches <= moved
					? { status: 422, json: { message: 'Update is not a fast forward' } }
					: { status: 200, json: {} };
			}
			return { status: 500 };
		};
	};
	const files = [
		{ path: `${DIR}/a-2026-10.md`, content: '---\ntitle: á\n---\n' },
		{ path: `${DIR}/b-2026-10.md`, content: '---\ntitle: b\n---\n' },
		{ path: `${DIR}/media/a-2026-10/1.webp`, sha: 'existing' },
		{ path: `${DIR}/media/b-2026-10/1.png`, base64: 'AAAA' }
	];
	const mustNotExist = [
		`${DIR}/a-2026-10.md`,
		`${DIR}/b-2026-10.md`,
		`${DIR}/media/a-2026-10`,
		`${DIR}/media/b-2026-10`
	];

	it('makes one commit with text inline, copied blobs and uploaded binaries', async () => {
		fakeRepo();
		const result = await commitFiles('t', { files, message: 'm', mustNotExist });
		expect(result.sha).toBe('commit0');
		expect(calls.filter((c) => c.url === 'git/blobs')).toHaveLength(1);
		const tree = calls.find((c) => c.method === 'POST' && c.url === 'git/trees')?.body;
		expect(tree.base_tree).toBe('tree0');
		expect(tree.tree).toEqual([
			{ path: files[0].path, mode: '100644', type: 'blob', content: files[0].content },
			{ path: files[1].path, mode: '100644', type: 'blob', content: files[1].content },
			{ path: files[2].path, mode: '100644', type: 'blob', sha: 'existing' },
			{ path: files[3].path, mode: '100644', type: 'blob', sha: 'blob-4' }
		]);
		const patch = calls.find((c) => c.method === 'PATCH');
		expect(patch?.body).toEqual({ sha: 'commit0', force: false });
		// mustNotExist: one listing per directory
		expect(calls.filter((c) => c.method === 'GET' && c.url.startsWith('git/trees/'))).toHaveLength(
			2
		);
	});
	it('rebuilds on the new head when main moved, never forcing', async () => {
		fakeRepo({ moved: 2 });
		const result = await commitFiles('t', { files, message: 'm', mustNotExist });
		expect(result.sha).toBe('commit2');
		const patches = calls.filter((c) => c.method === 'PATCH');
		expect(patches).toHaveLength(3);
		expect(patches.every((p) => p.body.force === false)).toBe(true);
		const parents = calls
			.filter((c) => c.method === 'POST' && c.url === 'git/commits')
			.map((c) => c.body.parents);
		expect(parents).toEqual([['head0'], ['head1'], ['head2']]);
	});
	it('gives up after three attempts', async () => {
		fakeRepo({ moved: 5 });
		await expect(commitFiles('t', { files, message: 'm', mustNotExist })).rejects.toBeInstanceOf(
			GitHubError
		);
	});
	it('refuses when a path already exists', async () => {
		fakeRepo({ exists: ['b-2026-10.md'] });
		await expect(commitFiles('t', { files, message: 'm', mustNotExist })).rejects.toBeInstanceOf(
			PathExistsError
		);
		expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
	});
	it('deletes files with a null sha in the same tree', async () => {
		fakeRepo();
		await commitFiles('t', {
			files: [
				{ path: 'src/lib/assets/x.png', base64: 'AAAA' },
				{ path: 'src/lib/assets/x.webp', delete: true }
			],
			message: 'm'
		});
		const tree = calls.find((c) => c.method === 'POST' && c.url === 'git/trees')?.body;
		expect(tree.tree).toContainEqual({
			path: 'src/lib/assets/x.webp',
			mode: '100644',
			type: 'blob',
			sha: null
		});
	});
	it('refuses when a file in `unchanged` was modified meanwhile', async () => {
		fakeRepo({ exists: ['a-2026-10.md'] });
		// the fake tree listing has no sha for a-2026-10.md: it "changed"
		await expect(
			commitFiles('t', {
				files: [{ path: `${DIR}/a-2026-10.md`, content: 'x' }],
				message: 'm',
				unchanged: [{ path: `${DIR}/a-2026-10.md`, sha: 'old' }]
			})
		).rejects.toBeInstanceOf(FileChangedError);
		expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
	});
	it('commits when the files in `unchanged` are still the ones read', async () => {
		let patches = 0;
		respond = (m, e) => {
			if (m === 'GET' && e === 'git/ref/heads/main')
				return { status: 200, json: { object: { sha: 'h' } } };
			if (m === 'GET' && e.startsWith('git/trees/'))
				return { status: 200, json: { tree: [{ path: 'a-2026-10.md', sha: 'same' }] } };
			if (m === 'GET' && e.startsWith('git/commits/'))
				return { status: 200, json: { tree: { sha: 't0' } } };
			if (m === 'POST' && e === 'git/trees') return { status: 201, json: { sha: 't1' } };
			if (m === 'POST' && e === 'git/commits') return { status: 201, json: { sha: 'c' } };
			if (m === 'PATCH') return (patches++, { status: 200, json: {} });
			return { status: 500 };
		};
		const r = await commitFiles('t', {
			files: [{ path: `${DIR}/a-2026-10.md`, content: 'x' }],
			message: 'm',
			unchanged: [{ path: `${DIR}/a-2026-10.md`, sha: 'same' }]
		});
		expect(r.sha).toBe('c');
		expect(patches).toBe(1);
	});
});

describe('getDirTexts', () => {
	it('reads every text file of a folder in one GraphQL request', async () => {
		respond = (m, e, body) => {
			expect(e).toBe('https://api.github.com/graphql');
			expect(body.variables).toEqual({
				owner: 'GorroRojo',
				name: 'kinkyvibe',
				expr: `main:${DIR}`
			});
			return {
				status: 200,
				json: {
					data: {
						repository: {
							object: {
								entries: [
									{ name: 'a.md', type: 'blob', oid: 's1', object: { text: 'A', isBinary: false } },
									{ name: 'media', type: 'tree', oid: 's2', object: {} },
									{ name: 'b.png', type: 'blob', oid: 's3', object: { text: null, isBinary: true } }
								]
							}
						}
					}
				}
			};
		};
		expect(await getDirTexts('t', DIR)).toEqual([{ path: `${DIR}/a.md`, sha: 's1', text: 'A' }]);
		expect(calls).toHaveLength(1);
	});
	it('turns GraphQL errors into a GitHubError', async () => {
		respond = () => ({ status: 200, json: { errors: [{ message: 'nope' }] } });
		await expect(getDirTexts('t', DIR)).rejects.toThrow(/nope/);
	});
});

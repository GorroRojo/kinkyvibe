import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Buffer } from 'buffer';
import {
	branchStamp,
	clearPullsCache,
	commitFiles,
	contentBranchName,
	contentKey,
	existingPaths,
	getDirTexts,
	getFile,
	isBranchOf,
	listDir,
	listTree,
	readFile,
	FileChangedError,
	PathExistsError,
	PendingChangeError,
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

describe('content keys and branch names', () => {
	it('knows which post a path belongs to', () => {
		expect(contentKey(`${DIR}/a-2026-10.md`)).toEqual({ kind: 'calendario', slug: 'a-2026-10' });
		expect(contentKey(`${DIR}/media/a-2026-10/1.webp`)).toEqual({
			kind: 'calendario',
			slug: 'a-2026-10'
		});
		expect(contentKey('src/lib/posts/material/guia.md')).toEqual({
			kind: 'material',
			slug: 'guia'
		});
		expect(contentKey('src/lib/assets/x.png')).toBeNull();
		expect(contentKey('src/lib/utils/tags.js')).toBeNull();
	});
	it('names branches contenido/<kind>-<slug>-<yyyymmdd-hhmmss> in Argentina time', () => {
		const now = Date.parse('2026-09-30T15:04:05Z');
		expect(branchStamp(now)).toBe('20260930-120405');
		expect(contentBranchName({ kind: 'calendario', slug: 'a-2026-10' }, now)).toBe(
			'contenido/calendario-a-2026-10-20260930-120405'
		);
	});
	it('matches branches of a post exactly (not of a longer slug)', () => {
		const key = { kind: 'calendario', slug: 'a' };
		expect(isBranchOf('contenido/calendario-a-20260930-120405', key)).toBe(true);
		expect(isBranchOf('contenido/calendario-a-20260930-120405-2', key)).toBe(true);
		expect(isBranchOf('contenido/calendario-a-b-20260930-120405', key)).toBe(false);
		expect(isBranchOf('claude/calendario-a-20260930-120405', key)).toBe(false);
	});
});

describe('commitFiles (publishes through a PR)', () => {
	const NOW = Date.parse('2026-09-30T15:04:05Z');
	const BRANCH_A = 'contenido/calendario-a-2026-10-20260930-110000';
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		clearPullsCache();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	/** @param {string} branch @param {number} number @param {boolean} [autoMerge] */
	const openPull = (branch, number, autoMerge = true) => ({
		number,
		html_url: `https://github.com/GorroRojo/kinkyvibe/pull/${number}`,
		node_id: `PR_${number}`,
		title: 'Contenido: edita A',
		head: { ref: branch, repo: { full_name: 'GorroRojo/kinkyvibe' } },
		auto_merge: autoMerge ? { merge_method: 'merge' } : null
	});

	/**
	 * @param {{
	 *   exists?: string[],
	 *   trees?: Record<string, Array<{path: string, sha?: string}>>,
	 *   pulls?: any[],
	 *   autoMerge?: 'ok' | 'off' | 'clean' | 'unprotected' | 'scope',
	 *   branchMoved?: number,
	 *   stackedState?: string,
	 *   refTaken?: number
	 * }} [opts]
	 */
	const fakeRepo = ({
		exists = [],
		trees,
		pulls = [],
		autoMerge = 'ok',
		branchMoved = 0,
		stackedState = 'open',
		refTaken = 0
	} = {}) => {
		let patches = 0;
		let commits = 0;
		let refs = 0;
		respond = (m, e, body) => {
			if (e === 'https://api.github.com/graphql') {
				if (autoMerge === 'ok')
					return { status: 200, json: { data: { enablePullRequestAutoMerge: {} } } };
				const message = {
					off: 'Auto merge is not allowed for this repository',
					clean: 'Pull request Pull request is in clean status',
					// What GitHub says when main has branch protection but no required check.
					unprotected: 'Pull request Branch does not have required protected branch rules',
					scope: 'Resource not accessible by integration'
				}[autoMerge];
				return { status: 200, json: { errors: [{ message }] } };
			}
			if (m === 'GET' && e.startsWith('pulls?')) return { status: 200, json: pulls };
			if (m === 'POST' && e === 'git/blobs')
				return { status: 201, json: { sha: 'blob-' + body.content.length } };
			if (m === 'GET' && e === 'git/ref/heads/main')
				return { status: 200, json: { object: { sha: 'mainhead' } } };
			if (m === 'GET' && e.startsWith('git/ref/heads/contenido/')) {
				const name = e.slice('git/ref/heads/'.length);
				return pulls.some((p) => p.head.ref === name)
					? { status: 200, json: { object: { sha: 'branchhead' + patches } } }
					: { status: 404, json: { message: 'Not Found' } };
			}
			if (m === 'GET' && e.startsWith('git/trees/')) {
				const at = decodeURIComponent(e.slice('git/trees/'.length)).split(':')[0];
				const list = trees?.[at] ?? exists.map((p) => ({ path: p }));
				return { status: 200, json: { tree: list } };
			}
			if (m === 'GET' && e.startsWith('git/commits/'))
				return { status: 200, json: { tree: { sha: 'tree-of-' + e.slice(12) } } };
			if (m === 'POST' && e === 'git/trees') return { status: 201, json: { sha: 'tree1' } };
			if (m === 'POST' && e === 'git/commits')
				return { status: 201, json: { sha: 'commit' + commits++ } };
			if (m === 'POST' && e === 'git/refs') {
				refs++;
				return refs <= refTaken
					? { status: 422, json: { message: 'Reference already exists' } }
					: { status: 201, json: { ref: body.ref } };
			}
			if (m === 'PATCH' && e.startsWith('git/refs/heads/contenido/')) {
				patches++;
				return patches <= branchMoved
					? { status: 422, json: { message: 'Update is not a fast forward' } }
					: { status: 200, json: {} };
			}
			if (m === 'GET' && /^pulls\/\d+$/.test(e))
				return { status: 200, json: { state: stackedState } };
			if (m === 'POST' && e === 'pulls')
				return {
					status: 201,
					json: {
						number: 42,
						html_url: 'https://github.com/GorroRojo/kinkyvibe/pull/42',
						node_id: 'PR_42'
					}
				};
			if (m === 'PUT' && e === 'pulls/42/merge') return { status: 200, json: { merged: true } };
			return { status: 500, json: { message: `unexpected ${m} ${e}` } };
		};
	};
	const files = [
		{ path: `${DIR}/a-2026-10.md`, content: '---\ntitle: "Fiesta á"\n---\n' },
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
	const writes = () => calls.filter((c) => c.method !== 'GET');

	it('commits on a new branch from main, opens a PR and turns auto-merge on', async () => {
		fakeRepo();
		const result = await commitFiles('t', {
			files,
			message: '[admin] Ana publicó calendario/a-2026-10',
			mustNotExist,
			pr: { action: 'publica', who: 'Ana' }
		});
		expect(result.sha).toBe('commit0');
		expect(result.pr).toEqual({
			number: 42,
			url: 'https://github.com/GorroRojo/kinkyvibe/pull/42',
			branch: 'contenido/calendario-a-2026-10-20260930-120405',
			stacked: false,
			state: 'auto'
		});
		// One commit, text inline, copied blobs by sha, binaries uploaded, parent = main's head.
		expect(calls.filter((c) => c.url === 'git/blobs')).toHaveLength(1);
		const tree = calls.find((c) => c.method === 'POST' && c.url === 'git/trees')?.body;
		expect(tree.base_tree).toBe('tree-of-mainhead');
		expect(tree.tree).toEqual([
			{ path: files[0].path, mode: '100644', type: 'blob', content: files[0].content },
			{ path: files[1].path, mode: '100644', type: 'blob', content: files[1].content },
			{ path: files[2].path, mode: '100644', type: 'blob', sha: 'existing' },
			{ path: files[3].path, mode: '100644', type: 'blob', sha: 'blob-4' }
		]);
		const commit = calls.find((c) => c.method === 'POST' && c.url === 'git/commits')?.body;
		expect(commit.parents).toEqual(['mainhead']);
		// mustNotExist: one listing per directory, on main's head
		const listings = calls.filter((c) => c.method === 'GET' && c.url.startsWith('git/trees/'));
		expect(listings).toHaveLength(2);
		expect(listings.every((c) => c.url.startsWith('git/trees/mainhead:'))).toBe(true);
		// The branch, the PR, auto-merge. main is never written to.
		expect(calls.find((c) => c.url === 'git/refs')?.body).toEqual({
			ref: 'refs/heads/contenido/calendario-a-2026-10-20260930-120405',
			sha: 'commit0'
		});
		expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
		const pull = calls.find((c) => c.method === 'POST' && c.url === 'pulls')?.body;
		expect(pull.base).toBe('main');
		expect(pull.head).toBe('contenido/calendario-a-2026-10-20260930-120405');
		expect(pull.title).toBe('Contenido: publica Fiesta á');
		expect(pull.body).toContain('panel de administración por **Ana**');
		expect(pull.body).toContain(`- \`${files[3].path}\``);
		const gql = calls.find((c) => c.url === 'https://api.github.com/graphql')?.body;
		expect(gql.query).toContain('enablePullRequestAutoMerge');
		expect(gql.query).toContain('mergeMethod: MERGE');
		expect(gql.variables).toEqual({ id: 'PR_42' });
	});

	it('leaves the PR open and says why when auto-merge is off in the repo', async () => {
		fakeRepo({ autoMerge: 'off' });
		const result = await commitFiles('t', { files: [files[0]], message: 'm' });
		expect(result.pr?.state).toBe('open');
		expect(result.pr?.number).toBe(42);
		expect(result.pr?.problem).toMatch(/Allow auto-merge/);
		expect(calls.some((c) => c.method === 'PUT')).toBe(false);
	});

	it('explains a token without permission for auto-merge', async () => {
		fakeRepo({ autoMerge: 'scope' });
		const result = await commitFiles('t', { files: [files[0]], message: 'm' });
		expect(result.pr?.state).toBe('open');
		expect(result.pr?.problem).toMatch(/permiso/);
	});

	it('merges right away when main requires no checks (GitHub: "clean status")', async () => {
		fakeRepo({ autoMerge: 'clean' });
		const result = await commitFiles('t', { files: [files[0]], message: 'm' });
		expect(result.pr?.state).toBe('merged');
		expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
			url: 'pulls/42/merge',
			body: { merge_method: 'merge' }
		});
	});

	it('merges right away when main has protection but no required check', async () => {
		fakeRepo({ autoMerge: 'unprotected' });
		const result = await commitFiles('t', { files: [files[0]], message: 'm' });
		expect(result.pr?.state).toBe('merged');
		expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ url: 'pulls/42/merge' });
	});

	it('picks another branch name if two saves share the same second', async () => {
		fakeRepo({ refTaken: 1 });
		const result = await commitFiles('t', { files: [files[0]], message: 'm' });
		expect(result.pr?.branch).toBe('contenido/calendario-a-2026-10-20260930-120405-2');
	});

	it('stacks a new commit on the open PR of the same post', async () => {
		fakeRepo({
			pulls: [openPull(BRANCH_A, 5)],
			trees: { branchhead0: [{ path: 'a-2026-10.md', sha: 'saved-before' }] }
		});
		const result = await commitFiles('t', {
			files: [{ path: `${DIR}/a-2026-10.md`, content: 'x' }],
			message: 'm',
			unchanged: [{ path: `${DIR}/a-2026-10.md`, sha: 'saved-before' }]
		});
		expect(result.pr).toEqual({
			number: 5,
			url: 'https://github.com/GorroRojo/kinkyvibe/pull/5',
			branch: BRANCH_A,
			stacked: true,
			state: 'auto'
		});
		// Checked and built on the PR's branch, not on main.
		expect(calls.some((c) => c.url === 'git/ref/heads/main')).toBe(false);
		expect(calls.find((c) => c.method === 'POST' && c.url === 'git/commits')?.body.parents).toEqual(
			['branchhead0']
		);
		expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({
			url: `git/refs/heads/${BRANCH_A}`,
			body: { sha: 'commit0', force: false }
		});
		// No second PR, and auto-merge was already on.
		expect(calls.some((c) => c.method === 'POST' && c.url === 'pulls')).toBe(false);
		expect(calls.some((c) => c.url === 'https://api.github.com/graphql')).toBe(false);
	});

	it('turns auto-merge on for a stacked PR that did not have it', async () => {
		fakeRepo({ pulls: [openPull(BRANCH_A, 5, false)] });
		const result = await commitFiles('t', { files: [files[0]], message: 'm' });
		expect(result.pr).toMatchObject({ number: 5, stacked: true, state: 'auto' });
		expect(calls.find((c) => c.url === 'https://api.github.com/graphql')?.body.variables).toEqual({
			id: 'PR_5'
		});
	});

	it('rebuilds on top when the PR branch moved meanwhile, never forcing', async () => {
		fakeRepo({ pulls: [openPull(BRANCH_A, 5)], branchMoved: 2 });
		const result = await commitFiles('t', { files: [files[0]], message: 'm' });
		expect(result.sha).toBe('commit2');
		const patches = calls.filter((c) => c.method === 'PATCH');
		expect(patches).toHaveLength(3);
		expect(patches.every((p) => p.body.force === false)).toBe(true);
		const parents = calls
			.filter((c) => c.method === 'POST' && c.url === 'git/commits')
			.map((c) => c.body.parents);
		expect(parents).toEqual([['branchhead0'], ['branchhead1'], ['branchhead2']]);
	});

	it('gives up after three attempts on a busy branch', async () => {
		fakeRepo({ pulls: [openPull(BRANCH_A, 5)], branchMoved: 5 });
		await expect(commitFiles('t', { files: [files[0]], message: 'm' })).rejects.toBeInstanceOf(
			GitHubError
		);
	});

	it('opens a new PR for the commit if the stacked one was merged just before', async () => {
		fakeRepo({ pulls: [openPull(BRANCH_A, 5)], stackedState: 'closed' });
		const result = await commitFiles('t', { files: [files[0]], message: 'm' });
		expect(result.pr).toMatchObject({
			number: 42,
			stacked: false,
			branch: 'contenido/calendario-a-2026-10-20260930-120405'
		});
		expect(calls.find((c) => c.url === 'git/refs')?.body.sha).toBe('commit0');
	});

	it('does not stack explicit batches (kind/slug given) on a post PR', async () => {
		fakeRepo({ pulls: [] });
		const result = await commitFiles('t', {
			files: [files[0], files[1]],
			message: 'm',
			pr: { kind: 'importar', slug: '2-eventos', action: 'importa', title: '2 borradores' }
		});
		expect(result.pr?.branch).toBe('contenido/importar-2-eventos-20260930-120405');
		expect(calls.find((c) => c.method === 'POST' && c.url === 'pulls')?.body.title).toBe(
			'Contenido: importa 2 borradores'
		);
	});

	it('refuses to touch a post with an unpublished change in another PR', async () => {
		fakeRepo({ pulls: [openPull('contenido/calendario-b-2026-10-20260930-110000', 9)] });
		const error = await commitFiles('t', {
			files: [files[0], files[1]],
			message: 'm',
			pr: { kind: 'etiquetas', slug: 'renombra' }
		}).catch((e) => e);
		expect(error).toBeInstanceOf(PendingChangeError);
		expect(error.path).toBe(files[1].path);
		expect(error.message).toContain('PR #9');
		expect(writes()).toEqual([]);
	});

	it('refuses when a path already exists', async () => {
		fakeRepo({ exists: ['b-2026-10.md'] });
		await expect(commitFiles('t', { files, message: 'm', mustNotExist })).rejects.toBeInstanceOf(
			PathExistsError
		);
		expect(writes().some((c) => c.url === 'git/refs' || c.url === 'pulls')).toBe(false);
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
		expect(calls.find((c) => c.method === 'POST' && c.url === 'pulls')?.body.body).toContain(
			'`src/lib/assets/x.webp` (se borra)'
		);
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
		expect(writes()).toEqual([]);
	});

	it('commits when the files in `unchanged` are still the ones read', async () => {
		fakeRepo({ trees: { mainhead: [{ path: 'a-2026-10.md', sha: 'same' }] } });
		const r = await commitFiles('t', {
			files: [{ path: `${DIR}/a-2026-10.md`, content: 'x' }],
			message: 'm',
			unchanged: [{ path: `${DIR}/a-2026-10.md`, sha: 'same' }]
		});
		expect(r.sha).toBe('commit0');
		expect(r.pr?.number).toBe(42);
	});
});

describe('getFile / readFile / listDir (newest saved version)', () => {
	const BRANCH_A = 'contenido/calendario-a-20260930-110000';
	beforeEach(() => clearPullsCache());
	/** @param {{pulls?: any[], onBranch?: boolean}} o */
	const fake = ({ pulls = [], onBranch = true }) => {
		respond = (m, e) => {
			if (e.startsWith('pulls?')) return { status: 200, json: pulls };
			const ref = decodeURIComponent(e.split('?ref=')[1] ?? '');
			if (e.startsWith(`contents/${DIR}/a.md`)) {
				if (ref === BRANCH_A && !onBranch) return { status: 404, json: {} };
				const text = ref === 'main' ? 'on main' : 'on branch';
				return {
					status: 200,
					json: {
						type: 'file',
						sha: ref === 'main' ? 's-main' : 's-branch',
						encoding: 'base64',
						content: Buffer.from(text).toString('base64')
					}
				};
			}
			if (e.startsWith(`contents/${DIR}/media/a`))
				return { status: 200, json: [{ name: ref === 'main' ? '1.jpg' : '2.jpg' }] };
			return { status: 404, json: {} };
		};
	};
	const pull = {
		number: 5,
		html_url: 'u',
		node_id: 'n',
		title: 't',
		head: { ref: BRANCH_A, repo: { full_name: 'GorroRojo/kinkyvibe' } },
		auto_merge: null
	};

	it('reads main when nothing is pending', async () => {
		fake({});
		expect(await readFile('t', `${DIR}/a.md`)).toEqual({
			raw: 'on main',
			sha: 's-main',
			ref: 'main'
		});
	});
	it('reads the branch of an open content PR of the same post', async () => {
		fake({ pulls: [pull] });
		expect(await readFile('t', `${DIR}/a.md`)).toEqual({
			raw: 'on branch',
			sha: 's-branch',
			ref: BRANCH_A
		});
		expect((await listDir('t', `${DIR}/media/a`)).map((f) => f.name)).toEqual(['2.jpg']);
		// The PR list is fetched once for both reads.
		expect(calls.filter((c) => c.url.startsWith('pulls?'))).toHaveLength(1);
	});
	it('falls back to main if the branch is already gone', async () => {
		fake({ pulls: [pull], onBranch: false });
		expect(await getFile('t', `${DIR}/a.md`)).toBe('on main');
	});
	it('reads main if the PR list can not be read', async () => {
		respond = (m, e) =>
			e.startsWith('pulls?')
				? { status: 403, json: { message: 'nope' } }
				: {
						status: 200,
						json: { type: 'file', sha: 's', encoding: 'base64', content: 'b24gbWFpbg==' }
					};
		expect(await getFile('t', `${DIR}/a.md`)).toBe('on main');
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

describe('getFile', () => {
	it('decodes the base64 content (wrapped in lines, as GitHub sends it) as UTF-8', async () => {
		const text = '---\ntitle: Año 🏙️\n---\n\n' + 'ñandú y amigues 🎉 '.repeat(20);
		const content = btoa(String.fromCharCode(...new TextEncoder().encode(text))).replace(
			/.{60}/g,
			'$&\n'
		);
		respond = (m, e) =>
			e === `contents/${DIR}/a.md?ref=main`
				? { status: 200, json: { type: 'file', encoding: 'base64', content } }
				: { status: 404, json: { message: 'Not Found' } };
		expect(await getFile('t', `${DIR}/a.md`)).toBe(text);
		expect(await getFile('t', `${DIR}/nope.md`)).toBeNull();
	});
	it('fails on a file GitHub sends without content (over 1 MB) instead of returning ""', async () => {
		respond = () => ({ status: 200, json: { type: 'file', encoding: 'none', content: '' } });
		await expect(getFile('t', `${DIR}/a.md`)).rejects.toThrow(/encoding none/);
	});
});

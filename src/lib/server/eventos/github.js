/**
 * Minimal GitHub client for the admin "cargar evento" page.
 *
 * Kept separate from $lib/external/github.js on purpose: every call here is awaited and every
 * non-2xx response throws a GitHubError with GitHub's own message, so the page can tell the
 * organizer what went wrong.
 */
import { Buffer } from 'buffer';

export const REPO = 'GorroRojo/kinkyvibe';
export const BRANCH = 'main';

export class GitHubError extends Error {
	/**
	 * @param {number} status
	 * @param {string} message
	 */
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

/** Thrown by commitFiles when one of `mustNotExist` already exists on the branch. */
export class PathExistsError extends Error {
	/** @param {string} path */
	constructor(path) {
		super(`Ya existe ${path}`);
		this.path = path;
	}
}

/** Thrown by commitFiles when a file listed in `unchanged` was modified on the branch meanwhile. */
export class FileChangedError extends Error {
	/** @param {string} path */
	constructor(path) {
		super(`${path} cambió en GitHub mientras tanto`);
		this.path = path;
	}
}

/** @param {string} path */
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');

/**
 * @param {string} token
 * @param {string} method
 * @param {string} endpoint relative to /repos/{REPO}/
 * @param {any} [body]
 */
async function gh(token, method, endpoint, body) {
	const response = await fetch(`https://api.github.com/repos/${REPO}/${endpoint}`, {
		method,
		headers: {
			'User-Agent': 'kinkyvibe-admin',
			Accept: 'application/vnd.github+json',
			'X-GitHub-Api-Version': '2022-11-28',
			Authorization: `Bearer ${token}`,
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (response.ok) return response.status === 204 ? null : await response.json();
	let detail = '';
	try {
		detail = (await response.json())?.message ?? '';
	} catch (e) {
		// not JSON
	}
	throw new GitHubError(
		response.status,
		`GitHub respondió ${response.status} (${method} ${endpoint.split('?')[0]})${detail ? ': ' + detail : ''}`
	);
}

/**
 * @param {string} token
 * @param {string} path
 * @param {string} [ref]
 * @returns {Promise<any|null>} null on 404
 */
async function getContents(token, path, ref = BRANCH) {
	try {
		return await gh(token, 'GET', `contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
	} catch (e) {
		if (e instanceof GitHubError && e.status === 404) return null;
		throw e;
	}
}

/**
 * Reads a text file from main.
 * @param {string} token
 * @param {string} path
 * @returns {Promise<string|null>} null if it doesn't exist
 */
export async function getFile(token, path) {
	const file = await getContents(token, path);
	if (!file) return null;
	if (Array.isArray(file) || file.type !== 'file') throw new Error(`${path} no es un archivo`);
	return Buffer.from(file.content, file.encoding).toString('utf-8');
}

/**
 * @param {string} token
 * @param {string} path file or directory
 * @param {string} [ref]
 */
export async function pathExists(token, path, ref = BRANCH) {
	return (await getContents(token, path, ref)) !== null;
}

/**
 * @param {string} token
 * @param {string} path
 * @returns {Promise<Array<{name: string, path: string, sha: string, type: string}>>} [] if missing
 */
export async function listDir(token, path) {
	const list = await getContents(token, path);
	return Array.isArray(list) ? list : [];
}

/**
 * Entries of a directory at `ref`, through the Git Trees API (one request, and no 1000-entry
 * limit like the contents API). With `recursive`, every file below it, with paths relative to
 * `path`.
 * @param {string} token
 * @param {string} path directory
 * @param {{ref?: string, recursive?: boolean}} [opts]
 * @returns {Promise<Array<{path: string, sha: string, type: string}>>} [] if missing
 */
export async function listTree(token, path, { ref = BRANCH, recursive = false } = {}) {
	try {
		const tree = await gh(
			token,
			'GET',
			`git/trees/${encodeURIComponent(ref)}:${encodePath(path)}${recursive ? '?recursive=1' : ''}`
		);
		return tree.tree ?? [];
	} catch (e) {
		if (e instanceof GitHubError && e.status === 404) return [];
		throw e;
	}
}

/**
 * Which of `paths` exist at `ref`. One tree listing per parent directory instead of one request
 * per path, so a batch of many files stays well within the Workers subrequest limit.
 * @param {string} token
 * @param {string[]} paths
 * @param {string} [ref]
 * @returns {Promise<string[]>}
 */
export async function existingPaths(token, paths, ref = BRANCH) {
	/** @type {Map<string, string[]>} */
	const byDir = new Map();
	for (const path of paths) {
		const i = path.lastIndexOf('/');
		const dir = path.slice(0, i);
		byDir.set(dir, [...(byDir.get(dir) ?? []), path.slice(i + 1)]);
	}
	const found = await Promise.all(
		[...byDir].map(async ([dir, names]) => {
			const entries = new Set((await listTree(token, dir, { ref })).map((e) => e.path));
			return names.filter((n) => entries.has(n)).map((n) => `${dir}/${n}`);
		})
	);
	return found.flat();
}

/**
 * Every file directly inside a directory of main, with its blob sha and (for text files) its
 * content, in ONE GraphQL request (the REST API would need one request per file, and a Worker
 * only gets a few dozen subrequests). Subdirectories and binary files are left out.
 * @param {string} token
 * @param {string} dir
 * @returns {Promise<Array<{path: string, sha: string, text: string}>>} [] if missing
 */
export async function getDirTexts(token, dir) {
	const [owner, name] = REPO.split('/');
	const response = await fetch('https://api.github.com/graphql', {
		method: 'POST',
		headers: {
			'User-Agent': 'kinkyvibe-admin',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			query: `query($owner: String!, $name: String!, $expr: String!) {
				repository(owner: $owner, name: $name) {
					object(expression: $expr) {
						... on Tree { entries { name type oid object { ... on Blob { text isBinary } } } }
					}
				}
			}`,
			variables: { owner, name, expr: `${BRANCH}:${dir}` }
		})
	});
	/** @type {any} */
	let json = null;
	try {
		json = await response.json();
	} catch (e) {
		// not JSON
	}
	if (!response.ok || json?.errors?.length) {
		const detail = json?.errors?.[0]?.message ?? json?.message ?? '';
		throw new GitHubError(
			response.ok ? 502 : response.status,
			`GitHub respondió ${response.status} (graphql ${dir})${detail ? ': ' + detail : ''}`
		);
	}
	const entries = json?.data?.repository?.object?.entries ?? [];
	return entries
		.filter(
			(/** @type {any} */ e) =>
				e.type === 'blob' && e.object && !e.object.isBinary && typeof e.object.text === 'string'
		)
		.map((/** @type {any} */ e) => ({ path: `${dir}/${e.name}`, sha: e.oid, text: e.object.text }));
}

/**
 * @typedef {object} CommitFile
 * @prop {string} path
 * @prop {string} [content] utf-8 text
 * @prop {string} [base64] binary content
 * @prop {string} [sha] sha of a blob that already exists in the repo (copy without re-uploading)
 * @prop {boolean} [delete] remove this file in the commit
 */

/**
 * Paths of `expected` whose blob on `ref` is no longer the given sha (changed or deleted).
 * One tree listing per directory.
 * @param {string} token
 * @param {Array<{path: string, sha: string}>} expected
 * @param {string} ref
 */
async function changedPaths(token, expected, ref) {
	/** @type {Map<string, Array<{name: string, path: string, sha: string}>>} */
	const byDir = new Map();
	for (const e of expected) {
		const i = e.path.lastIndexOf('/');
		const dir = e.path.slice(0, i);
		byDir.set(dir, [
			...(byDir.get(dir) ?? []),
			{ name: e.path.slice(i + 1), path: e.path, sha: e.sha }
		]);
	}
	const found = await Promise.all(
		[...byDir].map(async ([dir, list]) => {
			const shas = new Map((await listTree(token, dir, { ref })).map((e) => [e.path, e.sha]));
			return list.filter((e) => shas.get(e.name) !== e.sha).map((e) => e.path);
		})
	);
	return found.flat();
}

/**
 * Creates ONE commit on main with all the files (Git Data API: blobs → tree → commit → ref).
 * Text files go inline in the tree request and only binary files become blobs, so the number of
 * requests doesn't grow with the number of events. `mustNotExist` is checked with one listing
 * per directory. `unchanged` lists files (path + the blob sha they were read at) that must still
 * be the same on main, so edits made from an older read never overwrite someone else's change.
 * Retries if main moved in the meantime; never force-pushes.
 * @param {string} token
 * @param {{files: CommitFile[], message: string, mustNotExist?: string[], unchanged?: Array<{path: string, sha: string}>}} opts
 * @returns {Promise<{sha: string, url: string}>}
 */
export async function commitFiles(token, { files, message, mustNotExist = [], unchanged = [] }) {
	const entries = await Promise.all(
		files.map(async (f) => {
			const entry = { path: f.path, mode: '100644', type: 'blob' };
			if (f.delete) return { ...entry, sha: null };
			if (f.sha) return { ...entry, sha: f.sha };
			if (f.base64 === undefined) return { ...entry, content: f.content ?? '' };
			const blob = await gh(token, 'POST', 'git/blobs', { content: f.base64, encoding: 'base64' });
			return { ...entry, sha: blob.sha };
		})
	);
	for (let attempt = 0; ; attempt++) {
		const ref = await gh(token, 'GET', `git/ref/heads/${BRANCH}`);
		const head = ref.object.sha;
		const existing = await existingPaths(token, mustNotExist, head);
		if (existing.length) throw new PathExistsError(existing[0]);
		const changed = unchanged.length ? await changedPaths(token, unchanged, head) : [];
		if (changed.length) throw new FileChangedError(changed[0]);
		const headCommit = await gh(token, 'GET', `git/commits/${head}`);
		const tree = await gh(token, 'POST', 'git/trees', {
			base_tree: headCommit.tree.sha,
			tree: entries
		});
		const commit = await gh(token, 'POST', 'git/commits', {
			message,
			tree: tree.sha,
			parents: [head]
		});
		try {
			await gh(token, 'PATCH', `git/refs/heads/${BRANCH}`, { sha: commit.sha, force: false });
			return { sha: commit.sha, url: `https://github.com/${REPO}/commit/${commit.sha}` };
		} catch (e) {
			// 422 "Update is not a fast forward": someone pushed to main meanwhile. Rebuild on top.
			if (e instanceof GitHubError && e.status === 422 && attempt < 2) continue;
			throw e;
		}
	}
}

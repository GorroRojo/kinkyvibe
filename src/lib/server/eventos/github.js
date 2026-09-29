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
 * @typedef {object} CommitFile
 * @prop {string} path
 * @prop {string} [content] utf-8 text
 * @prop {string} [base64] binary content
 * @prop {string} [sha] sha of a blob that already exists in the repo (copy without re-uploading)
 */

/**
 * Creates ONE commit on main with all the files (Git Data API: blobs → tree → commit → ref).
 * Retries if main moved in the meantime; never force-pushes.
 * @param {string} token
 * @param {{files: CommitFile[], message: string, mustNotExist?: string[]}} opts
 * @returns {Promise<{sha: string, url: string}>}
 */
export async function commitFiles(token, { files, message, mustNotExist = [] }) {
	const blobShas = await Promise.all(
		files.map(async (f) => {
			if (f.sha) return f.sha;
			const blob = await gh(
				token,
				'POST',
				'git/blobs',
				f.base64 !== undefined
					? { content: f.base64, encoding: 'base64' }
					: { content: f.content ?? '', encoding: 'utf-8' }
			);
			return blob.sha;
		})
	);
	for (let attempt = 0; ; attempt++) {
		const ref = await gh(token, 'GET', `git/ref/heads/${BRANCH}`);
		const head = ref.object.sha;
		for (const path of mustNotExist) {
			if (await pathExists(token, path, head)) throw new PathExistsError(path);
		}
		const headCommit = await gh(token, 'GET', `git/commits/${head}`);
		const tree = await gh(token, 'POST', 'git/trees', {
			base_tree: headCommit.tree.sha,
			tree: files.map((f, i) => ({ path: f.path, mode: '100644', type: 'blob', sha: blobShas[i] }))
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

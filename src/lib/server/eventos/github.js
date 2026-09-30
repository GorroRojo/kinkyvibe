/**
 * Minimal GitHub client for the admin "cargar evento" page.
 *
 * Kept separate from $lib/external/github.js on purpose: every call here is awaited and every
 * non-2xx response throws a GitHubError with GitHub's own message, so the page can tell the
 * organizer what went wrong.
 */
import { base64ToUtf8 } from '$lib/utils/base64.js';

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

/** Thrown when GitHub sends a file without its content (files over 1 MB come as encoding "none"). */
export class UnreadableFileError extends Error {
	/**
	 * @param {string} path
	 * @param {string} encoding
	 */
	constructor(path, encoding) {
		super(`${path}: encoding ${encoding} no soportado`);
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
 * @param {string} token
 * @param {string} path file or directory
 * @param {string} [ref]
 */
export async function pathExists(token, path, ref = BRANCH) {
	return (await getContents(token, path, ref)) !== null;
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
	const data = await graphql(
		token,
		`
			query ($owner: String!, $name: String!, $expr: String!) {
				repository(owner: $owner, name: $name) {
					object(expression: $expr) {
						... on Tree {
							entries {
								name
								type
								oid
								object {
									... on Blob {
										text
										isBinary
									}
								}
							}
						}
					}
				}
			}
		`,
		{ owner, name, expr: `${BRANCH}:${dir}` },
		dir
	);
	const entries = data?.repository?.object?.entries ?? [];
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

/* ------------------------------------------------------------------------------------------ */
/*  Publishing through a pull request                                                          */
/* ------------------------------------------------------------------------------------------ */
/*
 * main is protected (the `ci-ok` check is required), so the panel never pushes to it. Every save
 * is a commit on a `contenido/<kind>-<slug>-<yyyymmdd-hhmmss>` branch plus a PR to main with
 * auto-merge on: GitHub merges it by itself once CI passes. A second save of the same post while
 * its PR is still open goes on top of that PR's branch (and the editor reads the post from that
 * branch meanwhile), so quick consecutive saves don't produce conflicting PRs. See
 * docs/publicar-contenido.md.
 */

export const CONTENT_BRANCH_PREFIX = 'contenido/';

/** `src/lib/posts/<kind>/<slug>.md` or a file below `src/lib/posts/<kind>/media/<slug>/`. */
const POST_FILE = /^src\/lib\/posts\/([a-z]+)\/(?:media\/([^/]+)\/.+|([^/]+)\.md)$/;

/** @param {string} s */
const branchPart = (s) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60) || 'cambios';

/**
 * The post a repo path belongs to (for branch names and "is there a pending PR for this?"), or
 * null for files that aren't part of a post (shared images, tag lists...).
 * @param {string} path
 * @returns {{kind: string, slug: string} | null}
 */
export function contentKey(path) {
	const m = POST_FILE.exec(path);
	if (!m) return null;
	return { kind: m[1], slug: m[2] ?? m[3] };
}

/**
 * `yyyymmdd-hhmmss` in Argentina (UTC-3 all year).
 * @param {number} now ms
 */
export function branchStamp(now) {
	return new Date(now - 3 * 60 * 60 * 1000)
		.toISOString()
		.replace(/\.\d+Z$/, '')
		.replace(/[-:]/g, '')
		.replace('T', '-');
}

/**
 * @param {{kind: string, slug: string}} key
 * @param {number} now
 */
export function contentBranchName(key, now) {
	return `${CONTENT_BRANCH_PREFIX}${branchPart(key.kind)}-${branchPart(key.slug)}-${branchStamp(now)}`;
}

/**
 * True if `branch` is a content branch of that post (`contenido/<kind>-<slug>-<stamp>[-n]`).
 * @param {string} branch
 * @param {{kind: string, slug: string}} key
 */
export function isBranchOf(branch, key) {
	const prefix = `${CONTENT_BRANCH_PREFIX}${branchPart(key.kind)}-${branchPart(key.slug)}-`;
	return branch.startsWith(prefix) && /^\d{8}-\d{6}(-\d+)?$/.test(branch.slice(prefix.length));
}

/**
 * @typedef {object} ContentPull
 * @prop {number} number
 * @prop {string} url
 * @prop {string} nodeId
 * @prop {string} branch
 * @prop {string} title
 * @prop {boolean} autoMerge
 */

/**
 * Open PRs to main from `contenido/*` branches of this repo, newest first.
 * @param {string} token
 * @returns {Promise<ContentPull[]>}
 */
export async function openContentPulls(token) {
	const list = await gh(
		token,
		'GET',
		`pulls?state=open&base=${BRANCH}&sort=created&direction=desc&per_page=100`
	);
	return (Array.isArray(list) ? list : [])
		.filter(
			(p) =>
				typeof p?.head?.ref === 'string' &&
				p.head.ref.startsWith(CONTENT_BRANCH_PREFIX) &&
				p.head.repo?.full_name === REPO
		)
		.map((p) => ({
			number: p.number,
			url: p.html_url,
			nodeId: p.node_id,
			branch: p.head.ref,
			title: p.title,
			autoMerge: Boolean(p.auto_merge)
		}));
}

/** Short cache of openContentPulls for reads (a page load reads a post and its media folder). */
const PULLS_TTL_MS = 5000;
/** @type {Map<string, {at: number, pulls: Promise<ContentPull[]>}>} */
const pullsCache = new Map();

/** @param {string} token */
function cachedContentPulls(token) {
	const hit = pullsCache.get(token);
	if (hit && Date.now() - hit.at < PULLS_TTL_MS) return hit.pulls;
	const pulls = openContentPulls(token).catch((e) => {
		pullsCache.delete(token);
		throw e;
	});
	pullsCache.set(token, { at: Date.now(), pulls });
	if (pullsCache.size > 50) pullsCache.delete(String(pullsCache.keys().next().value));
	return pulls;
}

/** Forget the cached PR list (tests, and after publishing). @param {string} [token] */
export function clearPullsCache(token) {
	if (token === undefined) pullsCache.clear();
	else pullsCache.delete(token);
}

/**
 * Where to read `path` from: the branch of an open content PR of the same post (its newest
 * saved version, not merged yet), or main.
 * @param {string} token
 * @param {string} path
 */
async function readRef(token, path) {
	const key = contentKey(path);
	if (!key) return BRANCH;
	try {
		const pull = (await cachedContentPulls(token)).find((p) => isBranchOf(p.branch, key));
		return pull ? pull.branch : BRANCH;
	} catch (e) {
		console.log('No se pudieron listar los PRs de contenido; se lee de main.', e);
		return BRANCH;
	}
}

/**
 * getContents on the post's pending branch if there is one (falling back to main if that branch
 * is gone, e.g. merged and deleted a moment ago), else on main.
 * @param {string} token
 * @param {string} path
 * @param {string} [keyPath] path that decides the post (default: `path`)
 */
async function getLatestContents(token, path, keyPath = path) {
	const ref = await readRef(token, keyPath);
	const found = await getContents(token, path, ref);
	if (found || ref === BRANCH) return { found, ref };
	return { found: await getContents(token, path, BRANCH), ref: BRANCH };
}

/**
 * Reads a text file: its newest saved version (the open content PR of its post, if any), else
 * main.
 * @param {string} token
 * @param {string} path
 * @returns {Promise<string|null>} null if it doesn't exist
 */
export async function getFile(token, path) {
	return (await readFile(token, path))?.raw ?? null;
}

/**
 * Like getFile, with the blob sha to save against (commitFiles `unchanged`) and the ref read.
 * @param {string} token
 * @param {string} path
 * @returns {Promise<{raw: string, sha: string, ref: string} | null>}
 */
export async function readFile(token, path) {
	const { found: file, ref } = await getLatestContents(token, path);
	if (!file) return null;
	if (Array.isArray(file) || file.type !== 'file') throw new Error(`${path} no es un archivo`);
	// Files over 1 MB come with encoding "none" and no content: fail instead of returning ''.
	if (file.encoding !== 'base64') throw new UnreadableFileError(path, file.encoding);
	return { raw: base64ToUtf8(file.content), sha: file.sha, ref };
}

/**
 * Directory listing (newest saved version, like getFile).
 * @param {string} token
 * @param {string} path
 * @returns {Promise<Array<{name: string, path: string, sha: string, type: string}>>} [] if missing
 */
export async function listDir(token, path) {
	// A media folder belongs to the post of any file inside it.
	const { found: list } = await getLatestContents(token, path, `${path}/x`);
	return Array.isArray(list) ? list : [];
}

/**
 * A GraphQL request; GraphQL errors become a GitHubError.
 * @param {string} token
 * @param {string} query
 * @param {Record<string, any>} variables
 * @param {string} what for error messages
 */
export async function graphql(token, query, variables, what) {
	const response = await fetch('https://api.github.com/graphql', {
		method: 'POST',
		headers: {
			'User-Agent': 'kinkyvibe-admin',
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ query, variables })
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
			`GitHub respondió ${response.status} (graphql ${what})${detail ? ': ' + detail : ''}`
		);
	}
	return json?.data;
}

/** Thrown by commitFiles when a file has unpublished changes in another open content PR. */
export class PendingChangeError extends Error {
	/**
	 * @param {string} path
	 * @param {{number: number, url: string}} pull
	 */
	constructor(path, pull) {
		super(
			`${path} tiene un cambio que todavía no se publicó (PR #${pull.number}). Esperá unos minutos a que se publique y volvé a intentar`
		);
		this.path = path;
		this.pull = pull;
	}
}

/**
 * @typedef {object} PublishOptions
 * @prop {string} [action] verb for the PR title: «Contenido: <action> <title>» (default "actualiza")
 * @prop {string} [title] what changed (default: the `title:` of the first post in the commit)
 * @prop {string} [who] who saved, for the PR description
 * @prop {string} [kind] branch name: `contenido/<kind>-<slug>-<stamp>` (default: the first post)
 * @prop {string} [slug]
 * @prop {boolean} [stack] add the commit to an open PR of the same post instead of opening
 *   another one (default: true when kind/slug come from a post)
 */

/**
 * @typedef {object} PublishResult
 * @prop {number} number
 * @prop {string} url
 * @prop {string} branch
 * @prop {boolean} stacked the commit went on top of an open PR of the same post
 * @prop {'auto'|'merged'|'open'} state auto: merges itself when CI passes; merged: merged right
 *   away (main required no checks); open: auto-merge could not be enabled (see `problem`)
 * @prop {string} [problem]
 */

/** @param {CommitFile[]} files */
function firstPostTitle(files) {
	for (const f of files) {
		if (f.content === undefined || !f.path.endsWith('.md')) continue;
		const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(f.content)?.[1] ?? '';
		const title = /^title:[ \t]*(.+)$/m.exec(front)?.[1]?.trim();
		if (title) return title.replace(/^(['"])(.*)\1$/, '$2');
	}
	return '';
}

/**
 * PR title and description.
 * @param {{files: CommitFile[], message: string, key: {kind: string, slug: string}, opts: PublishOptions}} p
 */
export function pullText({ files, message, key, opts }) {
	const what = opts.title || firstPostTitle(files) || `${key.kind}/${key.slug}`;
	const title = `Contenido: ${opts.action || 'actualiza'} ${what}`.slice(0, 200);
	const body = [
		`Cambio hecho desde el panel de administración${opts.who ? ` por **${opts.who}**` : ''}.`,
		'',
		'```',
		message,
		'```',
		'',
		'Archivos:',
		...files.map((f) => `- \`${f.path}\`${f.delete ? ' (se borra)' : ''}`),
		'',
		'Se mergea solo (auto-merge) cuando pasan las pruebas; si una falla, queda abierto y el panel lo muestra.'
	].join('\n');
	return { title, body };
}

/**
 * Human reason why auto-merge could not be enabled.
 * @param {string} message
 */
export function autoMergeProblem(message) {
	if (/auto.?merge/i.test(message) && /not allowed|disabled|not enabled/i.test(message))
		return 'la opción «Allow auto-merge» está apagada en la configuración del repo';
	if (/not accessible|permission|scope|forbidden|must have/i.test(message))
		return 'tu sesión de GitHub no tiene permiso para activar el merge automático';
	return message;
}

/**
 * Turns on auto-merge (merge commit). When main requires no check at that moment GitHub refuses
 * ("clean status": there is nothing to wait for), so the PR is merged right away instead.
 * @param {string} token
 * @param {{number: number, nodeId: string}} pull
 * @returns {Promise<{state: 'auto'|'merged'|'open', problem?: string}>}
 */
export async function enableAutoMerge(token, pull) {
	try {
		await graphql(
			token,
			`
				mutation ($id: ID!) {
					enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: MERGE }) {
						pullRequest {
							number
						}
					}
				}
			`,
			{ id: pull.nodeId },
			`auto-merge #${pull.number}`
		);
		return { state: 'auto' };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		if (/(clean|unstable|has_hooks) status/i.test(message)) {
			try {
				await gh(token, 'PUT', `pulls/${pull.number}/merge`, { merge_method: 'merge' });
				return { state: 'merged' };
			} catch (e2) {
				return { state: 'open', problem: e2 instanceof Error ? e2.message : String(e2) };
			}
		}
		return { state: 'open', problem: autoMergeProblem(message) };
	}
}

/**
 * Publishes files as ONE commit (Git Data API: blobs → tree → commit) on a content branch, and a
 * PR to main that merges itself when CI passes (see the comment above). Text files go inline in
 * the tree request and only binary files become blobs, so the number of requests doesn't grow
 * with the number of events. `mustNotExist` is checked with one listing per directory.
 * `unchanged` lists files (path + the blob sha they were read at) that must still be the same,
 * so edits made from an older read never overwrite someone else's change. Both are checked on
 * the commit's base: main, or the branch of the open PR it stacks on. Never force-pushes.
 * @param {string} token
 * @param {{files: CommitFile[], message: string, mustNotExist?: string[], unchanged?: Array<{path: string, sha: string}>, pr?: PublishOptions}} opts
 * @returns {Promise<{sha: string, url: string, pr?: PublishResult}>} `pr` is always set here; the
 *   dev mock and the demo layer (same interface) have no PR.
 */
export async function commitFiles(
	token,
	{ files, message, mustNotExist = [], unchanged = [], pr: opts = {} }
) {
	const postKey = files.map((f) => contentKey(f.path)).find(Boolean) ?? null;
	const explicit = Boolean(opts.kind && opts.slug);
	const key = explicit
		? { kind: String(opts.kind), slug: String(opts.slug) }
		: (postKey ?? { kind: opts.kind || 'contenido', slug: opts.slug || 'cambios' });
	const stackable = opts.stack ?? Boolean(postKey && !explicit);

	const pulls = await openContentPulls(token);
	/** @type {ContentPull | null} */
	let target = stackable ? (pulls.find((p) => isBranchOf(p.branch, key)) ?? null) : null;
	// Another open PR touching the same post would conflict with this one: wait for it.
	for (const f of files) {
		const k = contentKey(f.path);
		const other = k && pulls.find((p) => p !== target && isBranchOf(p.branch, k));
		if (other) throw new PendingChangeError(f.path, other);
	}

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

	let sha = '';
	let branch = '';
	for (let attempt = 0; ; attempt++) {
		const base = target ? target.branch : BRANCH;
		let head;
		try {
			head = (await gh(token, 'GET', `git/ref/heads/${base}`)).object.sha;
		} catch (e) {
			// The PR's branch is gone (merged and deleted meanwhile): start from main.
			if (target && e instanceof GitHubError && e.status === 404) {
				target = null;
				continue;
			}
			throw e;
		}
		const existing = await existingPaths(token, mustNotExist, head);
		if (existing.length) throw new PathExistsError(existing[0]);
		const changed = unchanged.length ? await changedPaths(token, unchanged, head) : [];
		if (changed.length) throw new FileChangedError(changed[0]);
		const headCommit = await gh(token, 'GET', `git/commits/${head}`);
		const tree = await gh(token, 'POST', 'git/trees', {
			base_tree: headCommit.tree.sha,
			tree: entries
		});
		sha = (await gh(token, 'POST', 'git/commits', { message, tree: tree.sha, parents: [head] }))
			.sha;
		if (target) {
			try {
				await gh(token, 'PATCH', `git/refs/heads/${target.branch}`, { sha, force: false });
				branch = target.branch;
				break;
			} catch (e) {
				// 422 "not a fast forward": someone saved on that PR meanwhile. Rebuild on top.
				if (e instanceof GitHubError && e.status === 422 && attempt < 2) continue;
				throw e;
			}
		}
		// A new branch at the commit (another name if two saves share the same second).
		branch = contentBranchName(key, Date.now());
		for (let n = 2; ; n++) {
			try {
				await gh(token, 'POST', 'git/refs', { ref: `refs/heads/${branch}`, sha });
				break;
			} catch (e) {
				if (e instanceof GitHubError && e.status === 422 && n < 5) {
					branch = `${contentBranchName(key, Date.now())}-${n}`;
					continue;
				}
				throw e;
			}
		}
		break;
	}
	const url = `https://github.com/${REPO}/commit/${sha}`;
	clearPullsCache(token);

	if (target && branch === target.branch) {
		// Still open? If it was merged just before our push, the commit needs a PR of its own.
		const current = await gh(token, 'GET', `pulls/${target.number}`);
		if (current?.state === 'open') {
			const state = target.autoMerge
				? { state: /** @type {'auto'} */ ('auto') }
				: await enableAutoMerge(token, target);
			return {
				sha,
				url,
				pr: { number: target.number, url: target.url, branch, stacked: true, ...state }
			};
		}
		branch = contentBranchName(key, Date.now());
		await gh(token, 'POST', 'git/refs', { ref: `refs/heads/${branch}`, sha });
	}
	const text = pullText({ files, message, key, opts });
	const created = await gh(token, 'POST', 'pulls', {
		title: text.title,
		body: text.body,
		head: branch,
		base: BRANCH
	});
	const pull = { number: created.number, url: created.html_url, nodeId: created.node_id };
	const state = await enableAutoMerge(token, pull);
	return {
		sha,
		url,
		pr: { number: pull.number, url: pull.url, branch, stacked: false, ...state }
	};
}

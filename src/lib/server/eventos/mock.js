/**
 * DEV-ONLY stand-in for ./github.js, used by the admin events page when running `vite dev` with
 * ADMIN_DEV_MOCK=1. Reads come from the local checkout; "commits" are written to a scratch
 * folder (ADMIN_DEV_MOCK_DIR, default <tmp>/kinkyvibe-admin-mock) instead of GitHub.
 *
 * This module is only ever loaded through a dynamic import guarded by `import.meta.env.DEV`
 * (see ./index.js), so it is not part of production builds.
 */
import { readFile, readdir, stat, mkdir, writeFile, copyFile, appendFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { PathExistsError } from './github.js';

export { GitHubError, PathExistsError, REPO, BRANCH } from './github.js';

const repoRoot = process.cwd();
export const outDir = resolve(env.ADMIN_DEV_MOCK_DIR || join(tmpdir(), 'kinkyvibe-admin-mock'));

/** @param {string} path */
async function exists(path) {
	try {
		await stat(path);
		return true;
	} catch (e) {
		return false;
	}
}

/** @param {string} path repo-relative */
function safeRepoPath(path) {
	const full = resolve(repoRoot, path);
	if (!full.startsWith(repoRoot + '/')) throw new Error('ruta inválida');
	return full;
}

/** @param {string} _token @param {string} path */
export async function getFile(_token, path) {
	const full = safeRepoPath(path);
	if (!(await exists(full))) return null;
	return await readFile(full, 'utf-8');
}

/** @param {string} _token @param {string} path */
export async function pathExists(_token, path) {
	return (await exists(safeRepoPath(path))) || (await exists(join(outDir, 'files', path)));
}

/** @param {string} _token @param {string} path */
export async function listDir(_token, path) {
	const full = safeRepoPath(path);
	if (!(await exists(full))) return [];
	const names = await readdir(full);
	// "sha" is the local source path, so commitFiles can copy it like GitHub reuses a blob.
	return names.map((name) => ({ name, path: `${path}/${name}`, sha: 'local:' + join(path, name), type: 'file' }));
}

/**
 * Same shape as github.listTree, from the local checkout ("sha" is the local path, see listDir).
 * @param {string} _token
 * @param {string} path
 * @param {{recursive?: boolean}} [opts]
 * @returns {Promise<Array<{path: string, sha: string, type: string}>>}
 */
export async function listTree(_token, path, { recursive = false } = {}) {
	const full = safeRepoPath(path);
	if (!(await exists(full))) return [];
	const entries = await readdir(full, { withFileTypes: true, recursive });
	return entries.map((e) => {
		// @ts-ignore parentPath/path depending on the Node version
		const rel = join(e.parentPath ?? e.path ?? full, e.name).slice(full.length + 1);
		return { path: rel, sha: 'local:' + join(path, rel), type: e.isDirectory() ? 'tree' : 'blob' };
	});
}

/** @param {string} _token @param {string[]} paths */
export async function existingPaths(_token, paths) {
	const found = await Promise.all(paths.map((p) => pathExists(_token, p)));
	return paths.filter((_, i) => found[i]);
}

/**
 * @param {string} _token
 * @param {{files: import('./github.js').CommitFile[], message: string, mustNotExist?: string[]}} opts
 */
export async function commitFiles(_token, { files, message, mustNotExist = [] }) {
	for (const path of mustNotExist) {
		if (await pathExists(_token, path)) throw new PathExistsError(path);
	}
	await new Promise((r) => setTimeout(r, 400)); // feel like a network call
	const hash = createHash('sha1').update(message + Date.now()).digest('hex');
	for (const f of files) {
		const target = join(outDir, 'files', f.path);
		await mkdir(dirname(target), { recursive: true });
		if (f.sha?.startsWith('local:')) await copyFile(safeRepoPath(f.sha.slice(6)), target);
		else if (f.base64 !== undefined) await writeFile(target, Buffer.from(f.base64, 'base64'));
		else await writeFile(target, f.content ?? '', 'utf-8');
	}
	await appendFile(
		join(outDir, 'commits.log'),
		JSON.stringify({ sha: hash, message, files: files.map((f) => f.path) }) + '\n'
	);
	console.log(`[ADMIN_DEV_MOCK] commit ${hash.slice(0, 7)} "${message}" → ${outDir}/files`);
	return { sha: hash, url: `https://github.com/GorroRojo/kinkyvibe/commit/${hash}?mock=1` };
}

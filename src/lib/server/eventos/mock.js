/**
 * DEV-ONLY stand-in for ./github.js, used by the admin pages when running `npm run dev:admin`
 * (`vite dev --mode admin`, which loads ADMIN_DEV_MOCK=1 from the committed .env.admin; works the
 * same on Windows, macOS and Linux). Reads come from the local checkout; "commits" are written to
 * a scratch folder (ADMIN_DEV_MOCK_DIR, default <tmp>/kinkyvibe-admin-mock) instead of GitHub.
 *
 * This module is only ever loaded through a dynamic import guarded by `import.meta.env.DEV`
 * (see ./index.js), so it is not part of production builds.
 */
import { readFile, readdir, stat, mkdir, writeFile, copyFile, appendFile, rm } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { PathExistsError } from './github.js';

export { GitHubError, PathExistsError, FileChangedError, REPO, BRANCH } from './github.js';

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

/**
 * Paths a mock "commit" deleted and nothing re-created since (<outDir>/deleted.txt).
 * @returns {Promise<Set<string>>}
 */
async function deletedPaths() {
	try {
		return new Set((await readFile(join(outDir, 'deleted.txt'), 'utf-8')).split('\n').filter(Boolean));
	} catch (e) {
		return new Set();
	}
}

/** @param {string} _token @param {string} path */
export async function getFile(_token, path) {
	const full = safeRepoPath(path);
	if ((await deletedPaths()).has(path)) return null;
	// Like GitHub: what an earlier mock "commit" wrote wins over the checkout (so an event created
	// with the mock can be opened in /edit, and a second edit sees the first one).
	const committed = join(outDir, 'files', path);
	if (resolve(committed).startsWith(outDir + '/') && (await exists(committed)))
		return await readFile(committed, 'utf-8');
	if (!(await exists(full))) return null;
	return await readFile(full, 'utf-8');
}

/** @param {string} _token @param {string} path */
export async function pathExists(_token, path) {
	if ((await deletedPaths()).has(path)) return false;
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
	/** @type {Map<string, {path: string, sha: string, type: string}>} */
	const out = new Map();
	// The checkout, plus what earlier mock "commits" wrote (so a second run sees them as taken).
	for (const [root, shaPrefix] of [
		[safeRepoPath(path), 'local:' + path],
		[join(outDir, 'files', path), '']
	]) {
		if (!(await exists(root))) continue;
		const entries = await readdir(root, { withFileTypes: true, recursive });
		for (const e of entries) {
			// @ts-ignore parentPath/path depending on the Node version
			const rel = join(e.parentPath ?? e.path ?? root, e.name).slice(root.length + 1);
			if (!out.has(rel))
				out.set(rel, {
					path: rel,
					sha: shaPrefix ? join(shaPrefix, rel) : 'mock-committed',
					type: e.isDirectory() ? 'tree' : 'blob'
				});
		}
	}
	return [...out.values()];
}

/** @param {string} _token @param {string[]} paths */
export async function existingPaths(_token, paths) {
	const found = await Promise.all(paths.map((p) => pathExists(_token, p)));
	return paths.filter((_, i) => found[i]);
}

/**
 * Same shape as github.getDirTexts, from the local checkout ("sha" is the local path).
 * @param {string} _token
 * @param {string} dir
 */
export async function getDirTexts(_token, dir) {
	const full = safeRepoPath(dir);
	if (!(await exists(full))) return [];
	const entries = await readdir(full, { withFileTypes: true });
	const out = [];
	for (const e of entries) {
		if (!e.isFile() || !/\.(md|txt|json|ya?ml)$/.test(e.name)) continue;
		const path = `${dir}/${e.name}`;
		out.push({ path, sha: 'local:' + path, text: await readFile(join(full, e.name), 'utf-8') });
	}
	return out;
}

/**
 * Writes the "commit" to <outDir>/files (deleted paths are listed in commits.log and
 * <outDir>/deleted.txt). `unchanged` is not checked: there is nobody else editing the checkout.
 * @param {string} _token
 * @param {{files: import('./github.js').CommitFile[], message: string, mustNotExist?: string[], unchanged?: Array<{path: string, sha: string}>}} opts
 */
export async function commitFiles(_token, { files, message, mustNotExist = [] }) {
	for (const path of mustNotExist) {
		if (await pathExists(_token, path)) throw new PathExistsError(path);
	}
	await new Promise((r) => setTimeout(r, 400)); // feel like a network call
	const hash = createHash('sha1').update(message + Date.now()).digest('hex');
	const deleted = [];
	for (const f of files) {
		const target = join(outDir, 'files', f.path);
		if (f.delete) {
			deleted.push(f.path);
			await rm(target, { force: true });
			await mkdir(outDir, { recursive: true });
			await appendFile(join(outDir, 'deleted.txt'), f.path + '\n');
			continue;
		}
		await mkdir(dirname(target), { recursive: true });
		// Re-created (e.g. restoring a deleted post): no longer deleted.
		const gone = await deletedPaths();
		if (gone.delete(f.path))
			await writeFile(join(outDir, 'deleted.txt'), [...gone].map((p) => p + '\n').join(''));
		if (f.sha?.startsWith('local:')) await copyFile(safeRepoPath(f.sha.slice(6)), target);
		else if (f.base64 !== undefined) await writeFile(target, Buffer.from(f.base64, 'base64'));
		else await writeFile(target, f.content ?? '', 'utf-8');
	}
	await appendFile(
		join(outDir, 'commits.log'),
		JSON.stringify({
			sha: hash,
			message,
			files: files.filter((f) => !f.delete).map((f) => f.path),
			deleted
		}) + '\n'
	);
	console.log(`[ADMIN_DEV_MOCK] commit ${hash.slice(0, 7)} "${message}" → ${outDir}/files`);
	return { sha: hash, url: `https://github.com/GorroRojo/kinkyvibe/commit/${hash}?mock=1` };
}

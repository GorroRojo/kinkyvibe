/**
 * Cliente "GitHub" del modo demo: misma interfaz que $lib/server/eventos/github.js, pero los
 * commits se guardan en la tabla `demo_files` de la base de prueba (./overlay.js) y las lecturas
 * prefieren esa capa y si no, leen los archivos tal como están en el deploy (./bundle.js).
 * Nunca llama a GitHub. Lo elige getRepoClient() en los deploys de preview.
 */
import { PathExistsError } from '../eventos/github.js';
import { demoUser } from './identity.js';
import { overlayIndex, overlayRow, writeOverlay } from './overlay.js';

/**
 * @typedef {object} Bundle
 * @prop {Record<string, () => Promise<string>>} texts repo path → loader of its text
 * @prop {Set<string>} files every repo path in the deploy (texts and images)
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

const TEXT_FILE = /\.(md|txt|json|ya?ml)$/;

/** @param {string} path */
const shaOf = (path) => 'demo:' + path;

/** @param {string} path */
const trimSlashes = (path) => path.replace(/^\/+|\/+$/g, '');

export class DemoUnavailableError extends Error {
	constructor() {
		super('Modo demo: la base de prueba (binding DB) no está disponible en este deploy.');
	}
}

/**
 * @param {{ getDB: () => D1Database | null | undefined, bundle: Bundle }} deps
 */
export function createDemoClient({ getDB, bundle }) {
	function db() {
		const d = getDB();
		if (!d) throw new DemoUnavailableError();
		return d;
	}

	/**
	 * Every file path that exists now: the deploy's, plus the layer's, minus the deleted ones.
	 * @returns {Promise<Set<string>>}
	 */
	async function allPaths() {
		const index = await overlayIndex(db());
		const out = new Set(bundle.files);
		for (const [path, e] of index) {
			if (e.deleted) out.delete(path);
			else out.add(path);
		}
		return out;
	}

	/**
	 * @param {string} path
	 * @returns {Promise<string|null>}
	 */
	async function readText(path) {
		const row = await overlayRow(db(), path);
		if (row) {
			if (row.deleted) return null;
			if (row.encoding === 'utf-8') return row.content ?? '';
			if (row.encoding === 'ref' && row.content) return await bundleText(row.content);
			return ''; // binary: the content isn't kept
		}
		return await bundleText(path);
	}

	/** @param {string} path */
	async function bundleText(path) {
		const load = bundle.texts[path];
		return load ? await load() : null;
	}

	/**
	 * Entries under `dir`, relative to it.
	 * @param {string} dir
	 * @param {boolean} recursive
	 * @returns {Promise<Array<{path: string, sha: string, type: 'blob'|'tree'}>>}
	 */
	async function entriesUnder(dir, recursive) {
		const base = trimSlashes(dir) + '/';
		/** @type {Map<string, {path: string, sha: string, type: 'blob'|'tree'}>} */
		const out = new Map();
		for (const path of await allPaths()) {
			if (!path.startsWith(base)) continue;
			const rel = path.slice(base.length);
			const parts = rel.split('/');
			if (!recursive && parts.length > 1) {
				out.set(parts[0], { path: parts[0], sha: shaOf(base + parts[0]), type: 'tree' });
				continue;
			}
			// Recursive listings (like GitHub's) also include the intermediate folders.
			for (let i = 1; i < parts.length; i++) {
				const sub = parts.slice(0, i).join('/');
				out.set(sub, { path: sub, sha: shaOf(base + sub), type: 'tree' });
			}
			out.set(rel, { path: rel, sha: shaOf(path), type: 'blob' });
		}
		return [...out.values()].sort((a, b) => a.path.localeCompare(b.path));
	}

	/** @param {string} _token @param {string} path */
	async function getFile(_token, path) {
		return await readText(trimSlashes(path));
	}

	/** @param {string} _token @param {string} path file or directory */
	async function pathExists(_token, path) {
		const p = trimSlashes(path);
		for (const existing of await allPaths()) {
			if (existing === p || existing.startsWith(p + '/')) return true;
		}
		return false;
	}

	/**
	 * @param {string} _token
	 * @param {string} path
	 * @returns {Promise<Array<{name: string, path: string, sha: string, type: string}>>}
	 */
	async function listDir(_token, path) {
		const dir = trimSlashes(path);
		return (await entriesUnder(dir, false)).map((e) => ({
			name: e.path,
			path: `${dir}/${e.path}`,
			sha: e.sha,
			type: e.type === 'tree' ? 'dir' : 'file'
		}));
	}

	/**
	 * @param {string} _token
	 * @param {string} path
	 * @param {{ref?: string, recursive?: boolean}} [opts]
	 */
	async function listTree(_token, path, { recursive = false } = {}) {
		return await entriesUnder(path, recursive);
	}

	/**
	 * @param {string} _token
	 * @param {string[]} paths
	 */
	async function existingPaths(_token, paths) {
		const all = await allPaths();
		return paths.filter((p) => all.has(trimSlashes(p)));
	}

	/**
	 * @param {string} _token
	 * @param {string} path
	 */
	async function getDirTexts(_token, path) {
		const dir = trimSlashes(path);
		const files = (await entriesUnder(dir, false)).filter(
			(e) => e.type === 'blob' && TEXT_FILE.test(e.path)
		);
		const out = [];
		for (const f of files) {
			const text = await readText(`${dir}/${f.path}`);
			if (text !== null) out.push({ path: `${dir}/${f.path}`, sha: f.sha, text });
		}
		return out;
	}

	/**
	 * Guarda el "commit" en la capa. `unchanged` no se revisa (en la demo no hay otra persona
	 * editando el repo). `mustNotExist` sí, igual que en GitHub.
	 * @param {string} _token
	 * @param {{files: import('../eventos/github.js').CommitFile[], message: string, mustNotExist?: string[], unchanged?: Array<{path: string, sha: string}>}} opts
	 */
	async function commitFiles(_token, { files, message, mustNotExist = [] }) {
		const existing = await existingPaths(_token, mustNotExist);
		if (existing.length) throw new PathExistsError(existing[0]);
		const index = await overlayIndex(db());
		/** @type {import('./overlay.js').OverlayWrite[]} */
		const writes = [];
		for (const f of files) {
			const path = trimSlashes(f.path);
			if (f.delete) writes.push({ path, content: null, encoding: 'utf-8', deleted: true });
			else if (f.sha?.startsWith('demo:')) {
				// Copia de un archivo existente (p. ej. renombrar una imagen compartida).
				const source = f.sha.slice(5);
				const inLayer = index.get(source);
				if (inLayer && !inLayer.deleted) {
					const row = await overlayRow(db(), source);
					writes.push({ path, content: row?.content ?? null, encoding: inLayer.encoding });
				} else writes.push({ path, content: source, encoding: 'ref' });
			} else if (f.base64 !== undefined) writes.push({ path, content: null, encoding: 'binary' });
			else writes.push({ path, content: f.content ?? '', encoding: 'utf-8' });
		}
		await writeOverlay(db(), writes, { author: demoUser().name ?? 'demo', message });
		const sha = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
			b.toString(16).padStart(2, '0')
		).join('');
		// No hay commit de verdad: el link lleva al estado del preview, que lista los cambios demo.
		return { sha, url: '/api/preview-status' };
	}

	return { getFile, pathExists, listDir, listTree, existingPaths, getDirTexts, commitFiles };
}

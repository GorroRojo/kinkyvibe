/**
 * Renombrar una etiqueta en las publicaciones (docs/etiquetas.md).
 *
 * Decisión de gorrite: al renombrar en la base, por defecto el nombre viejo NO queda como alias y
 * se reescriben las publicaciones que lo usan; la otra opción es dejar el alias y no tocarlas.
 * Este módulo es la parte de las publicaciones, por el mismo camino que el editor del archivo
 * (`replaceTagInPost` sobre los .md del repo, un solo commit con `commitTagEdit`).
 *
 * Es UNA función a propósito (`planTagRenameInPosts`): lee las publicaciones con el cliente del
 * repo (los eventos y el material, de la base; amigues y la wiki, del repo) y se guardan por el
 * mismo cliente, así que quien llama no sabe dónde vive cada una.
 *
 * Con las etiquetas como edges (migración 0042, contenido/etiquetasEdges.js), un evento o un
 * material que nombra la etiqueta por edge NO se reescribe: el edge apunta a la etiqueta, y al
 * cambiarle el `key` el post ya muestra el nombre nuevo. Solo se reescriben los que la tienen como
 * texto (`data.tags`, porque cuando se guardaron la etiqueta no existía) y los del repo. Cuáles
 * son por edge lo dice el cliente (`linkedTagsOf`, contenido/repo.js); un cliente sin eso (el
 * archivo, el mock) reescribe todo, como antes.
 *
 * Sin imports de SvelteKit: se prueba con un cliente de mentira (rename.test.js).
 */
import { POST_DIRS, readPostFiles } from '../admin/tagEditor.js';
import { postRenamePairs, renameTagsInPosts } from '../../utils/tagConfig.js';

/** @typedef {import('../admin/tagEditor.js').TagClient} TagClient */
/** @typedef {import('../../utils/tagConfig.js').TagOp} TagOp */

/**
 * Qué publicaciones cambian por los renombres SIN alias de `ops` (los que dejan alias no tocan
 * nada). Lee el repo solo si hay alguno.
 *
 * @param {Pick<TagClient, 'getDirTexts'> & { linkedTagsOf?: LinkedTagsOf }} client
 * @param {string} token
 * @param {readonly TagOp[]} ops
 * @returns {Promise<{ pairs: Array<[string, string]>, files: import('../../utils/tagConfig.js').PlannedFile[], summary: string[] }>}
 *   Si alguna la nombra por edge, `summary` lo dice en una línea más (cambian solas).
 */
export async function planTagRenameInPosts(client, token, ops) {
	const pairs = postRenamePairs(ops, { onlyWithoutAlias: true });
	if (!pairs.length) return { pairs, files: [], summary: [] };
	const [posts, byPath] = await Promise.all([
		readPostFiles(client, token),
		linkedTagsByPath(client, token)
	]);
	const linkedPosts = posts.filter((p) => pairs.some(([from]) => byPath.get(p.path)?.has(from)));
	return {
		pairs,
		files: renameTagsInPosts(posts, pairs, (path) => byPath.get(path)),
		summary: [
			...pairs.map(([from, to]) => `Renombrar «${from}» a «${to}» en las publicaciones`),
			...(linkedPosts.length
				? [
						`${linkedPosts.length === 1 ? '1 publicación la tiene enlazada y cambia sola' : `${linkedPosts.length} publicaciones la tienen enlazada y cambian solas`} (no se reescribe${linkedPosts.length === 1 ? '' : 'n'})`
					]
				: [])
		]
	};
}

/**
 * @typedef {(token: string, dir: string) => Promise<ReadonlyMap<string, ReadonlySet<string>>>} LinkedTagsOf
 */

/**
 * Por dirección, las etiquetas que cada post nombra por edge (vacío si el cliente no sabe).
 *
 * @param {{ linkedTagsOf?: LinkedTagsOf }} client
 * @param {string} token
 * @returns {Promise<Map<string, ReadonlySet<string>>>}
 */
async function linkedTagsByPath(client, token) {
	/** @type {Map<string, ReadonlySet<string>>} */
	const out = new Map();
	if (typeof client.linkedTagsOf !== 'function') return out;
	const linkedTagsOf = client.linkedTagsOf;
	for (const m of await Promise.all(POST_DIRS.map((d) => linkedTagsOf(token, d)))) {
		for (const [path, keys] of m) out.set(path, keys);
	}
	return out;
}

/**
 * ¿Hay algún renombre que reescribe publicaciones? (sin leer nada)
 *
 * @param {readonly TagOp[]} ops
 */
export const renamesPosts = (ops) => postRenamePairs(ops, { onlyWithoutAlias: true }).length > 0;

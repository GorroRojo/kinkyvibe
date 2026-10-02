/**
 * Renombrar una etiqueta en las publicaciones, con el interruptor `etiquetas_db` (docs/etiquetas.md).
 *
 * Decisión de gorrite: al renombrar en la base, por defecto el nombre viejo NO queda como alias y
 * se reescriben las publicaciones que lo usan; la otra opción es dejar el alias y no tocarlas.
 * Este módulo es la parte de las publicaciones, por el mismo camino que el editor del archivo
 * (`replaceTagInPost` sobre los .md del repo, un solo commit con `commitTagEdit`).
 *
 * Es UNA función a propósito (`planTagRenameInPosts`): hoy las publicaciones son los .md del repo;
 * cuando el contenido pase a la base (interruptor `contenido_db`, en otra pila de PRs) esta misma
 * función tiene que sumar los posts guardados en la base, y quien llama no cambia.
 *
 * Sin imports de SvelteKit: se prueba con un cliente de mentira (rename.test.js).
 */
import { readPostFiles } from '../admin/tagEditor.js';
import { postRenamePairs, renameTagsInPosts } from '../../utils/tagConfig.js';

/** @typedef {import('../admin/tagEditor.js').TagClient} TagClient */
/** @typedef {import('../../utils/tagConfig.js').TagOp} TagOp */

/**
 * Qué publicaciones cambian por los renombres SIN alias de `ops` (los que dejan alias no tocan
 * nada). Lee el repo solo si hay alguno.
 *
 * @param {Pick<TagClient, 'getDirTexts'>} client
 * @param {string} token
 * @param {readonly TagOp[]} ops
 * @returns {Promise<{ pairs: Array<[string, string]>, files: import('../../utils/tagConfig.js').PlannedFile[], summary: string[] }>}
 */
export async function planTagRenameInPosts(client, token, ops) {
	const pairs = postRenamePairs(ops, { onlyWithoutAlias: true });
	if (!pairs.length) return { pairs, files: [], summary: [] };
	const posts = await readPostFiles(client, token);
	return {
		pairs,
		files: renameTagsInPosts(posts, pairs),
		summary: pairs.map(([from, to]) => `Renombrar «${from}» a «${to}» en las publicaciones`)
	};
}

/**
 * ¿Hay algún renombre que reescribe publicaciones? (sin leer nada)
 *
 * @param {readonly TagOp[]} ops
 */
export const renamesPosts = (ops) => postRenamePairs(ops, { onlyWithoutAlias: true }).length > 0;

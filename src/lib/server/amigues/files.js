/**
 * Las fichas .md de amigues leídas del disco (Node: el script de importación y las pruebas). En
 * el Worker se usa `bundledAmigueFiles()` de ./review.js, que las trae del deploy.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const AMIGUES_DIR = path.resolve('src/lib/posts/amigues');

/**
 * Las fichas como las pide `importAmigues` (`legacySlug` = el nombre del archivo sin `.md`).
 *
 * @param {string} [dir]
 * @returns {Promise<{ legacySlug: string, raw: string }[]>}
 */
export async function readAmigueFiles(dir = AMIGUES_DIR) {
	const names = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
	return Promise.all(
		names.map(async (name) => ({
			legacySlug: name.slice(0, -3),
			raw: await readFile(path.join(dir, name), 'utf8')
		}))
	);
}

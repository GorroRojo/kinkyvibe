/**
 * «Descargar todo» (decisión 0004: git no guarda una copia del contenido; lo resguardan los
 * backups y este botón): los eventos, el material, los perfiles de amigues y las páginas de la
 * wiki de la base como archivos .md, armados desde la base con la misma forma que los .md del repo
 * (los interactivos, como el componente importado en su `<script>`: ./markdown.js con `legacy`;
 * los perfiles y la wiki, con ./fichas.js). Incluye los ocultos (`force_unpublished: true`); no
 * los borrados.
 */
import { CONTENT_CATEGORIES } from './categories.js';
import { postToMarkdown } from './markdown.js';
import { allDbPostObjects } from './repo.js';
import { FICHA_CATEGORIES, listFichas } from './fichas.js';

/** @typedef {import('@cloudflare/workers-types').D1Database} D1Database */

/**
 * Los archivos del .tar (`calendario/<slug>.md`, `material/<slug>.md`, `amigues/<slug>.md`,
 * `wiki/<slug>.md`), ordenados por nombre.
 *
 * @param {D1Database} db
 * @returns {Promise<{ name: string, content: string }[]>}
 */
export async function contentArchiveFiles(db) {
	/** @type {{ name: string, content: string }[]} */
	const files = [];
	for (const category of Object.keys(CONTENT_CATEGORIES)) {
		for (const [slug, e] of await allDbPostObjects(db, category)) {
			if (e.deleted) continue;
			const name = `${category}/${slug}.md`;
			files.push({
				name:
					/^[\w./-]+$/.test(name) && name.length <= 100 ? name : `${category}/${e.object.id}.md`,
				content: postToMarkdown(category, e.object, { legacy: true })
			});
		}
	}
	for (const category of FICHA_CATEGORIES) {
		for (const f of await listFichas(db, category)) {
			const name = `${category}/${f.slug}.md`;
			files.push({
				name:
					/^[\w./-]+$/.test(name) && name.length <= 100 ? name : `${category}/${f.object.id}.md`,
				content: f.raw
			});
		}
	}
	return files.sort((a, b) => a.name.localeCompare(b.name));
}

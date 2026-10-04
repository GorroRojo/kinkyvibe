/**
 * Las páginas de la Kinkipedia (`/wiki/<término>`) en la base: el texto de la wiki es el cuerpo de
 * la etiqueta (diseño de gorrite, docs/etiquetas.md), así que una página de la wiki es una
 * etiqueta con texto de la wiki (`body`, `wiki_title`, `wiki_summary`, `wiki_authors`,
 * `wiki_tags`; `wiki_body_html` decide cómo se muestra). Lo importa el importador de etiquetas
 * desde `src/lib/posts/wiki/*.md` y se edita en el panel (Etiquetas → «Texto de la wiki»).
 *
 * El .md de una página ({@link wikiToMarkdown}) tiene la misma metadata y el mismo texto que el
 * .md del repo: lo usan «Descargar todo» y el cliente del repo (src/lib/server/contenido/fichas.js),
 * así lo que todavía trabaja con el texto de un .md (renombrar etiquetas, el editor de texto)
 * guarda en la base.
 *
 * Funciones puras. Solo imports relativos.
 */
import YAML from 'yaml';
import { tagSlug } from '../../utils/tagSlug.js';
import { asText as str, asTextList as strList } from '../../utils/text.js';

/** Los campos de la etiqueta que son su página de la wiki (el resto es la etiqueta). */
export const WIKI_FIELDS = Object.freeze([
	'body',
	'wiki_title',
	'wiki_summary',
	'wiki_authors',
	'wiki_tags',
	'wiki_body_html'
]);

/**
 * @typedef {{
 *   key: string,
 *   slug: string,
 *   title: string,
 *   summary: string,
 *   authors: string[],
 *   tags: string[],
 *   body: string,
 *   bodyHtml: 'libre' | 'corta'
 * }} WikiEntry
 *   `slug`: la dirección de la página (`tagSlug(key)`: espacios → guiones, como los nombres de los
 *   .md de la wiki). `bodyHtml`: sin valor guardado, `libre` (lo importado del repo).
 */

/**
 * ¿La etiqueta tiene página de la wiki?
 *
 * @param {Record<string, unknown>} data
 */
export function hasWikiPage(data) {
	return Boolean(str(data.body) || str(data.wiki_title) || str(data.wiki_summary));
}

/**
 * La página de la wiki de una etiqueta (sin mirar si tiene: ver {@link hasWikiPage}).
 *
 * @param {string} key
 * @param {string} title el título de la etiqueta (si la página no tiene uno propio)
 * @param {Record<string, unknown>} data
 * @returns {WikiEntry}
 */
export function wikiEntryOf(key, title, data) {
	return {
		key,
		slug: tagSlug(key),
		title: str(data.wiki_title) || str(title) || key,
		summary: str(data.wiki_summary),
		authors: strList(data.wiki_authors),
		tags: strList(data.wiki_tags),
		body: String(data.body ?? '').trimEnd(),
		bodyHtml: data.wiki_body_html === 'corta' ? 'corta' : 'libre'
	};
}

/**
 * Las páginas de la wiki de las etiquetas leídas (los alias no tienen), por dirección.
 *
 * @param {readonly { key: string, title: string, data: Record<string, unknown>, aliasOf?: string | null }[]} records
 * @returns {WikiEntry[]}
 */
export function wikiEntriesOf(records) {
	return records
		.filter((r) => !r.aliasOf && hasWikiPage(r.data))
		.map((r) => wikiEntryOf(r.key, r.title, r.data))
		.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * La página de la wiki de una etiqueta como el .md del repo (`src/lib/posts/wiki/<dirección>.md`):
 * `title`, `wiki` (la etiqueta), `summary`, `tags`, `layout`, `category`, `authors` y el texto.
 *
 * @param {string} key
 * @param {Record<string, unknown>} data
 * @returns {string}
 */
export function wikiToMarkdown(key, data) {
	/** @type {Record<string, unknown>} */
	const meta = {};
	const title = str(data.wiki_title);
	if (title) meta.title = title;
	meta.wiki = key;
	const summary = str(data.wiki_summary);
	if (summary) meta.summary = summary;
	const tags = strList(data.wiki_tags);
	if (tags.length) meta.tags = tags;
	meta.layout = 'wiki';
	meta.category = 'wiki';
	const authors = strList(data.wiki_authors);
	if (authors.length) meta.authors = authors;
	const frontmatter = YAML.stringify(meta, { lineWidth: 0 }).trimEnd();
	const body = String(data.body ?? '').trimEnd();
	return `---\n${frontmatter}\n---\n${body ? `\n${body}\n` : ''}`;
}

/**
 * Lee el .md de una página de la wiki (lo que guarda el editor de texto o renombrar etiquetas).
 * Tira (en castellano) si las propiedades no se pueden leer.
 *
 * @param {string} raw
 * @returns {{ wiki: string, title: string, summary: string, authors: string[], tags: string[], body: string }}
 */
export function markdownToWiki(raw) {
	const text = String(raw ?? '').replace(/\r\n?/g, '\n');
	const m = text.match(/^---[ \t]*\n([\s\S]*?)\n?---[ \t]*(?:\n|$)([\s\S]*)$/);
	if (!m) throw new Error('El texto no empieza con un bloque de propiedades entre "---".');
	let meta;
	try {
		meta = m[1].trim() ? YAML.parse(m[1], { schema: 'failsafe' }) : {};
	} catch (e) {
		throw new Error(
			'Las propiedades tienen un error de formato: ' +
				String(/** @type {Error} */ (e).message).split('\n')[0]
		);
	}
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		throw new Error('Las propiedades tienen que ser una lista de «clave: valor».');
	}
	const r = /** @type {Record<string, unknown>} */ (meta);
	return {
		wiki: str(r.wiki),
		title: str(r.title),
		summary: str(r.summary),
		authors: strList(r.authors),
		tags: strList(r.tags),
		body: m[2].replace(/^(?:[ \t]*\n)+/, '').trimEnd()
	};
}

/**
 * Los datos de la etiqueta con su página de la wiki cambiada: lo que no es de la wiki queda como
 * estaba; un campo vacío se saca. `bodyHtml`: cómo se muestra el texto (lo decide quien guarda).
 *
 * @param {Record<string, unknown>} current
 * @param {{ title: string, summary: string, authors: string[], tags: string[], body: string }} page
 * @param {'libre' | 'corta' | undefined} bodyHtml
 * @returns {Record<string, unknown>}
 */
export function withWikiPage(current, page, bodyHtml) {
	/** @type {Record<string, unknown>} */
	const data = {};
	for (const [k, v] of Object.entries(current)) {
		if (!WIKI_FIELDS.includes(k)) data[k] = v;
	}
	if (page.body) data.body = page.body;
	if (page.title) data.wiki_title = page.title;
	if (page.summary) data.wiki_summary = page.summary;
	if (page.authors.length) data.wiki_authors = page.authors;
	if (page.tags.length) data.wiki_tags = page.tags;
	if (page.body && bodyHtml) data.wiki_body_html = bodyHtml;
	return data;
}

/**
 * Cómo se muestra el texto que se guarda (como `bodyHtmlFor` de los eventos): si el texto no
 * cambió, como estaba; si cambió, HTML libre si lo guarda une superadmin y la lista corta si no.
 *
 * @param {Record<string, unknown>} current los datos de la etiqueta antes de guardar
 * @param {string} body el texto nuevo
 * @param {boolean} superadmin
 * @returns {'libre' | 'corta' | undefined}
 */
export function wikiBodyHtmlFor(current, body, superadmin) {
	const text = str(body);
	if (!text) return undefined;
	if (str(current.body) === text) {
		const kept = current.wiki_body_html;
		return kept === 'corta' || kept === 'libre' ? kept : undefined;
	}
	return superadmin ? 'libre' : 'corta';
}

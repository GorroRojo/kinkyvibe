/**
 * Saving material posts from the panel (/admin/contenido/material): the post, in the database,
 * through the content client of $lib/server/eventos (`withContentDb`, $lib/server/contenido/repo.js).
 * The image is a library image (edge `portada`), never a file.
 *
 * Takes the client as a parameter and has no SvelteKit imports, so it is tested with a fake.
 */
import { toHex } from '$lib/utils/base64.js';
import { postFilePath } from '$lib/utils/postPaths.js';
import { CONTENT_CATEGORIES } from '$lib/utils/contentPosts.js';

/**
 * @typedef {{
 *   getFile: (token: string, path: string) => Promise<string | null>,
 *   commitFiles: (token: string, opts: any) => Promise<import('../contenido/cliente.js').PublishResult>
 * }} PostClient
 */

/**
 * Git's blob sha of a text file (sha1 of "blob <bytes>\0<content>"), to tell GitHub "only if the
 * file is still the one I read" (commitFiles `unchanged`) after reading it with getFile.
 * @param {string} text
 */
export async function gitBlobSha(text) {
	const encoder = new TextEncoder();
	const body = encoder.encode(text);
	const head = encoder.encode(`blob ${body.length}\0`);
	const all = new Uint8Array(head.length + body.length);
	all.set(head, 0);
	all.set(body, head.length);
	const digest = await crypto.subtle.digest('SHA-1', all);
	return toHex(digest);
}

/**
 * Repo path of a post of a content category, or null.
 * @param {string} category
 * @param {string} slug
 */
export function contentPath(category, slug) {
	if (!CONTENT_CATEGORIES.includes(category)) return null;
	return postFilePath(category, slug);
}

/**
 * Reads a post (from the database) with the sha to save against.
 * @param {PostClient} client
 * @param {string} token
 * @param {string} category
 * @param {string} slug
 * @returns {Promise<{raw: string, sha: string} | null>} null if it doesn't exist
 */
export async function readContentPost(client, token, category, slug) {
	const path = contentPath(category, slug);
	if (!path) return null;
	const raw = await client.getFile(token, path);
	if (raw === null) return null;
	return { raw, sha: await gitBlobSha(raw) };
}

/**
 * Plans the files of a save: just the post.
 * @param {{category: string, slug: string, content: string, isNew: boolean, baseSha?: string}} opts
 */
export function planContentSave({ category, slug, content, isNew, baseSha }) {
	const path = contentPath(category, slug);
	if (!path) throw new Error('Dirección de publicación inválida.');
	/** @type {import('../contenido/cliente.js').CommitFile[]} */
	const files = [{ path, content }];
	/** @type {string[]} */
	const mustNotExist = isNew ? [path] : [];
	/** @type {Array<{path: string, sha: string}>} */
	const unchanged = !isNew && baseSha ? [{ path, sha: baseSha }] : [];
	return { path, files, mustNotExist, unchanged, content };
}

/**
 * Message of a panel save (kept in the audit trail): `[admin] <who> created material/<slug>`.
 * @param {{who: string, verb: 'created'|'updated'|'unlisted'|'listed'|'duplicated', category: string, slug: string, from?: string}} m
 */
export function contentCommitMessage({ who, verb, category, slug, from }) {
	const extra = from ? `desde ${category}/${from}` : '';
	return `[admin] ${who} ${verb} ${category}/${slug}${extra ? ` (${extra})` : ''}`;
}

/**
 * Saves a post.
 * @param {PostClient} client
 * @param {string} token
 * @param {{category: string, slug: string, content: string, isNew: boolean, baseSha?: string, message: string, pr?: import('../contenido/cliente.js').PublishOptions, edges?: Record<string, number[]>}} opts
 *   `edges`: relaciones del post que cambian en el mismo guardado (la imagen de la biblioteca,
 *   `{ portada: [id] }`; docs/imagenes.md)
 */
export async function saveContentPost(client, token, opts) {
	const plan = planContentSave(opts);
	const commit = await client.commitFiles(token, {
		files: plan.files,
		message: opts.message,
		mustNotExist: plan.mustNotExist,
		unchanged: plan.unchanged,
		...(opts.pr ? { pr: opts.pr } : {}),
		...(opts.edges ? { edges: { [plan.path]: opts.edges } } : {})
	});
	return { ...plan, commit };
}

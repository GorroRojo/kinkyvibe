/**
 * Saving material and amigues posts from the panel (/admin/contenido/material, /admin/comunidad/perfiles): one commit
 * with the post and, optionally, a new image in its media folder. Same commit path as the event
 * editor (the GitHub client of $lib/server/eventos, which is the dev mock under
 * `npm run dev:admin` and the demo layer on preview deploys).
 *
 * Takes the client as a parameter and has no SvelteKit imports, so it is tested with a fake.
 */
import { toHex } from '$lib/utils/base64.js';
import { postFilePath } from '$lib/utils/postPaths.js';
import { nextMediaNumber, setFeatured } from '$lib/utils/sharedImage.js';
import { CONTENT_CATEGORIES } from '$lib/utils/contentPosts.js';

/**
 * @typedef {Pick<typeof import('../eventos/github.js'), 'getFile' | 'listDir' | 'commitFiles'>} PostClient
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

/** @param {string} category @param {string} slug */
export const contentMediaDir = (category, slug) => `src/lib/posts/${category}/media/${slug}`;

/**
 * Reads a post from the repo (main, the mock or the demo layer) with the sha to save against.
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
 * @typedef {object} SaveImage
 * @prop {string} base64
 * @prop {'jpg'|'png'|'webp'} ext
 */

/**
 * Plans the files of a save. New posts get their image as `media/<slug>/1.<ext>`; existing ones,
 * the next free number of their folder (images the text uses are never overwritten).
 * @param {PostClient} client
 * @param {string} token
 * @param {{category: string, slug: string, content: string, isNew: boolean, baseSha?: string, image?: SaveImage | null}} opts
 */
export async function planContentSave(
	client,
	token,
	{ category, slug, content, isNew, baseSha, image }
) {
	const path = contentPath(category, slug);
	if (!path) throw new Error('Dirección de publicación inválida.');
	let text = content;
	/** @type {import('../eventos/github.js').CommitFile[]} */
	const files = [];
	/** @type {string[]} */
	const mustNotExist = isNew ? [path] : [];
	/** @type {Array<{path: string, sha: string}>} */
	const unchanged = !isNew && baseSha ? [{ path, sha: baseSha }] : [];
	/** @type {string | null} */
	let imagePath = null;
	if (image) {
		const dir = contentMediaDir(category, slug);
		const n = isNew ? 1 : nextMediaNumber((await client.listDir(token, dir)).map((f) => f.name));
		imagePath = `${dir}/${n}.${image.ext}`;
		text = setFeatured(text, n);
		files.push({ path: imagePath, base64: image.base64 });
		mustNotExist.push(imagePath);
	}
	files.unshift({ path, content: text });
	return { path, files, mustNotExist, unchanged, imagePath, content: text };
}

/**
 * Commit message for a panel save: `[admin] <who> created material/<slug>`.
 * @param {{who: string, verb: 'created'|'updated'|'unlisted'|'listed'|'duplicated', category: string, slug: string, from?: string, image?: boolean}} m
 */
export function contentCommitMessage({ who, verb, category, slug, from, image }) {
	const extra = [from ? `desde ${category}/${from}` : '', image ? 'imagen nueva' : '']
		.filter(Boolean)
		.join(', ');
	return `[admin] ${who} ${verb} ${category}/${slug}${extra ? ` (${extra})` : ''}`;
}

/**
 * Saves a post in one commit.
 * @param {PostClient} client
 * @param {string} token
 * @param {{category: string, slug: string, content: string, isNew: boolean, baseSha?: string, image?: SaveImage | null, message: string, pr?: import('../eventos/github.js').PublishOptions}} opts
 */
export async function saveContentPost(client, token, opts) {
	const plan = await planContentSave(client, token, opts);
	const commit = await client.commitFiles(token, {
		files: plan.files,
		message: opts.message,
		mustNotExist: plan.mustNotExist,
		unchanged: plan.unchanged,
		...(opts.pr ? { pr: opts.pr } : {})
	});
	return { ...plan, commit };
}

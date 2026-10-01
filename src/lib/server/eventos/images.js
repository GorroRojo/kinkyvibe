/**
 * Server side of "¿Esta imagen es para todas las ediciones de este evento o solo para esta?"
 * (see $lib/utils/sharedImage.js). Shared by /admin/eventos/nuevo and /admin/eventos/<slug>/editar
 *
 * Takes the GitHub client as a parameter (github.js, or mock.js under `npm run dev:admin`), so it
 * has no SvelteKit imports and can be tested with a fake client.
 */
import { toBase64 } from '$lib/utils/base64.js';
import { detectImageType, MAX_IMAGE_BYTES } from '$lib/utils/eventDraft.js';
import {
	eventsUsingAsset,
	nextMediaNumber,
	planSharedAssetReplace
} from '$lib/utils/sharedImage.js';

export const POSTS_DIR = 'src/lib/posts/calendario';

/**
 * @typedef {Pick<typeof import('./github.js'), 'getDirTexts' | 'listDir' | 'pathExists'>} ImageClient
 */

/**
 * Validates the uploaded image. Returns its bytes and extension, or a message for the person.
 * @param {FormDataEntryValue|null} image
 * @returns {Promise<{bytes: Uint8Array, ext: 'jpg'|'png'|'webp', base64: string} | {error: string}>}
 */
export async function readUploadedImage(image) {
	if (!(image instanceof File) || image.size === 0) {
		return { error: 'Elegiste subir una imagen pero no llegó ningún archivo. Volvé a elegirla.' };
	}
	if (image.size > MAX_IMAGE_BYTES) {
		return { error: 'La imagen pesa más de 5 MB. Probá con una más liviana.' };
	}
	const bytes = new Uint8Array(await image.arrayBuffer());
	const ext = detectImageType(bytes);
	if (!ext) return { error: 'La imagen tiene que ser JPG, PNG o WEBP.' };
	return { bytes, ext, base64: toBase64(bytes) };
}

/**
 * Events on main whose `featured` is the shared file `name`, newest first. One request.
 * @param {ImageClient} client
 * @param {string} token
 * @param {string} name
 */
export async function findAssetUsers(client, token, name) {
	return eventsUsingAsset(await client.getDirTexts(token, POSTS_DIR), name).map((u) => ({
		slug: u.slug,
		title: u.title,
		start: u.start
	}));
}

/**
 * The files of a "todas las ediciones" upload: the shared image (replaced in place, or written
 * under the new extension with the old file deleted) and, when it was renamed, every event that
 * pointed to it. Everything goes in ONE commit; `unchanged` makes the commit fail instead of
 * overwriting an event someone edited after we read it.
 *
 * @param {ImageClient} client
 * @param {string} token
 * @param {{oldName: string, ext: string, base64: string, override?: Record<string, {text: string, sha?: string}>}} opts
 */
export async function sharedAssetCommit(client, token, { oldName, ext, base64, override = {} }) {
	const files = await client.getDirTexts(token, POSTS_DIR);
	const plan = planSharedAssetReplace({ oldName, ext, files, override });
	/** @type {import('./github.js').CommitFile[]} */
	const commitFiles = [...plan.files, { path: plan.assetPath, base64 }];
	/** @type {string[]} */
	const mustNotExist = [];
	if (plan.renamed) {
		// Never overwrite some other image that happens to have the new name.
		mustNotExist.push(plan.assetPath);
		if (await client.pathExists(token, plan.oldAssetPath))
			commitFiles.push({ path: plan.oldAssetPath, delete: true });
	}
	return { ...plan, commitFiles, mustNotExist };
}

/**
 * Path and `featured` number for a "solo esta" upload into an existing event's folder: the next
 * free number, so images the text of the event may use are never overwritten.
 * @param {ImageClient} client
 * @param {string} token
 * @param {string} slug
 * @param {string} ext
 */
export async function ownImageTarget(client, token, slug, ext) {
	const dir = `${POSTS_DIR}/media/${slug}`;
	const names = (await client.listDir(token, dir)).map((f) => f.name);
	const n = nextMediaNumber(names);
	return { featured: n, path: `${dir}/${n}.${ext}` };
}

import { Buffer } from 'buffer';
import { error, fail } from '@sveltejs/kit';
import { ghGet, ghPut } from '$lib/external/github.js';
import { requireAdmin } from '$lib/server/auth';
import { editorData } from '$lib/server/admin/content.js';
import { featuredURL, getRepoClient, isMockMode } from '$lib/server/eventos';
import { FileChangedError } from '$lib/server/eventos/github.js';
import {
	findAssetUsers,
	ownImageTarget,
	readUploadedImage,
	sharedAssetCommit
} from '$lib/server/eventos/images.js';
import { validateEventTags } from '$lib/utils/adminTags.js';
import { getDB } from '$lib/server/db';
import { salesByType, ticketsFileErrors } from '$lib/server/tickets/editor.js';
import { MAX_IMAGE_BYTES, readEventFields, splitMarkdown } from '$lib/utils/eventDraft.js';
import {
	featuredOf,
	isSafeAssetName,
	isSharedAsset,
	nextMediaNumber,
	setFeatured,
	uploadScope
} from '$lib/utils/sharedImage.js';

/**
 * @param {{category: string, postID: string}} params
 */
function postPath(params) {
	return `src/lib/posts/${params.category}/${params.postID}.md`;
}

/** @type {import("./$types").PageServerLoad} */
export async function load({ locals, params, url, platform }) {
	// Server loads run in parallel with the layout load, so guard here too.
	requireAdmin(locals, url);
	const post = await getFileContent(locals.user_token, postPath(params));
	const isEvent = params.category === 'calendario';
	// Entradas ya vendidas o reservadas por tipo: el editor no deja romper esas compras.
	const sales = isEvent ? await salesByType(getDB(platform), params.postID) : null;
	return {
		sales,
		salesUnavailable: isEvent && sales === null,
		post,
		// Tag usage, amigues profiles and past authors for the pickers.
		...(await editorData(params.category)),
		image:
			params.category === 'calendario'
				? await imageInfo(locals.user_token, params.postID, post.raw)
				: null,
		maxImageBytes: MAX_IMAGE_BYTES,
		mock: isMockMode()
	};
}

/**
 * The event's current image, and the number a new "solo esta" image would get.
 * @param {string} token
 * @param {string} slug
 * @param {string} raw
 */
async function imageInfo(token, slug, raw) {
	const featured = featuredOf(raw);
	let nextNumber = 1;
	try {
		const client = await getRepoClient();
		nextNumber = nextMediaNumber((await client.listDir(token, mediaDir(slug))).map((f) => f.name));
	} catch (e) {
		// Only a preview: the save action looks again.
	}
	return {
		featured,
		url: featuredURL(slug, featured),
		shared: isSharedAsset(featured),
		nextNumber,
		folder: `calendario/media/${slug}/`
	};
}

/** @param {string} slug */
const mediaDir = (slug) => `src/lib/posts/calendario/media/${slug}`;

/** @type {import("./$types").Actions} */
export const actions = {
	// Form actions do not run the (authed) layout load: each one must check auth.
	save: async ({ params, locals, request, url, platform }) => {
		const user = requireAdmin(locals, url);
		const data = await request.formData();
		const fileContent = data.get('content');
		const sha = data.get('sha');
		if (typeof fileContent !== 'string' || typeof sha !== 'string' || sha === '') {
			return fail(400, {
				error: 'Faltan datos para guardar. Recargá la página y volvé a intentar.'
			});
		}
		// Events follow the same tag rules as /admin/eventos/nuevo (one language, one place).
		const tagError = params.category === 'calendario' ? eventTagError(fileContent) : null;
		if (tagError) return fail(400, { error: tagError });
		if (params.category === 'calendario') {
			const ticketError = await newTicketsError(
				locals.user_token,
				params,
				fileContent,
				await salesByType(getDB(platform), params.postID)
			);
			if (ticketError) return fail(400, { error: ticketError });
		}
		// Commit author label from the verified GitHub user; `name` is null for
		// accounts without a display name, so fall back to the login.
		const userName = user.name || user.login || 'admin';
		const image = data.get('image');
		if (params.category === 'calendario' && image instanceof File && image.size > 0) {
			return await saveWithImage({
				token: locals.user_token,
				params,
				content: fileContent,
				sha,
				userName,
				image,
				asked: String(data.get('imageScope') ?? '')
			});
		}
		try {
			await saveFileContent(
				locals.user_token,
				postPath(params),
				fileContent,
				sha,
				userName,
				params.category,
				params.postID
			);
		} catch (e) {
			console.log(e);
			return fail(502, {
				error:
					'No se pudo guardar. Puede que otra persona haya editado esta publicación: copiá tus cambios, recargá la página y volvé a intentar.'
			});
		}
		return { save: 'Guardado' };
	},
	/** Events that show a shared image, for the "todas las ediciones" option. */
	afectados: async ({ locals, request, url }) => {
		requireAdmin(locals, url);
		const name = String((await request.formData()).get('asset') ?? '');
		if (!isSafeAssetName(name)) return fail(400, { error: 'Imagen inválida.' });
		try {
			const client = await getRepoClient();
			return { affected: await findAssetUsers(client, locals.user_token, name) };
		} catch (e) {
			return fail(502, { error: 'No pudimos consultar GitHub.' });
		}
	},
	load: async ({ locals, request, url }) => {
		requireAdmin(locals, url);
		const data = await request.formData();
		const fileContent = await getFileContent(
			locals.user_token,
			'src/lib/posts/' + data.get('category') + '/' + data.get('path') + '.md'
		);
		return { post: fileContent };
	}
};
/**
 *
 * @param {string} token
 * @param {string} path
 * @returns {Promise<*>}
 */
async function getFileContent(token, path) {
	if (isMockMode()) {
		// DEV ONLY (`npm run dev:admin`): read the local checkout, see $lib/server/eventos/mock.js.
		const raw = await (await getRepoClient()).getFile(token, path);
		if (raw === null) throw error(404, 'No se encontró la publicación');
		return { raw, sha: 'dev-mock', path };
	}
	let fileContent = await ghGet('repos/GorroRojo/kinkyvibe/contents/' + path, token);
	if (!fileContent) throw error(404, 'No se encontró la publicación');
	let raw = Buffer.from(fileContent.content, fileContent.encoding).toString();
	return { raw, ...fileContent };
}

/**
 * Saves the content of a file to a specified path in a GitHub repository.
 *
 * @param {string} token - The access token for the GitHub repository.
 * @param {string} path - The path to the file in the GitHub repository.
 * @param {string} content - The content to be saved in the file.
 * @param {string} sha - The file's original sha
 * @param {string} userName - The user's name
 * @param {string} category - The category of the post
 * @param {string} postID - The post ID
 * @return {Promise<*>} A promise that resolves with the response from the GitHub API.
 */
async function saveFileContent(token, path, content, sha, userName, category, postID) {
	if (isMockMode()) {
		// DEV ONLY: "commit" to the mock's temp folder instead of GitHub.
		const client = await getRepoClient();
		return await client.commitFiles(token, {
			files: [{ path, content }],
			message: `[admin] ${userName} updated ${category}/${postID}`
		});
	}
	return await ghPut(
		'repos/GorroRojo/kinkyvibe/contents/' + path,
		token,
		content,
		sha,
		userName,
		category,
		postID
	);
}

/**
 * The tag-rule problems of an event file, or null. A file whose properties can't be read is
 * left to save as before (the editor shows the problem).
 * @param {string} content
 */
function eventTagError(content) {
	let tags;
	try {
		tags = readEventFields(splitMarkdown(content).frontmatter).tags;
	} catch (e) {
		return null;
	}
	const errors = validateEventTags(tags);
	return errors.length ? errors.join(' ') : null;
}

/**
 * Problemas de la venta de entradas que agrega este guardado, o null. Los que el archivo ya tenía
 * (por ejemplo, cargado a mano) no bloquean guardar otros cambios; los que rompen compras hechas
 * (borrar un tipo con ventas, bajar el cupo por debajo de lo vendido, apagar la venta) sí, porque
 * se comparan con las ventas de la base.
 * @param {string} token
 * @param {{category: string, postID: string}} params
 * @param {string} content
 * @param {import('$lib/utils/ticketsEditor.js').SalesByType | null} sales
 */
async function newTicketsError(token, params, content, sales) {
	const errors = ticketsFileErrors(content, { sales });
	if (!errors.length) return null;
	/** @type {string[]} */
	let before = [];
	try {
		const current = await getFileContent(token, postPath(params));
		before = ticketsFileErrors(current.raw, { sales });
	} catch (e) {
		// Sin el archivo actual, todo cuenta como nuevo.
	}
	const added = errors.filter((e) => !before.includes(e));
	return added.length ? added.join(' ') : null;
}

/**
 * Saves an event together with a new image, in one commit (see $lib/utils/sharedImage.js):
 * - "todas": replaces the shared image in src/lib/assets (renaming it and updating every event
 *   that uses it if the extension changes);
 * - "esta" (or an event without a shared image): the next free number of the event's own folder.
 * @param {{token: string, params: {category: string, postID: string}, content: string, sha: string, userName: string, image: File, asked: string}} opts
 */
async function saveWithImage({ token, params, content, sha, userName, image, asked }) {
	const read = await readUploadedImage(image);
	if ('error' in read) return fail(400, { error: read.error });
	const path = postPath(params);
	const client = await getRepoClient();
	// The image the event uses on GitHub now (the form's content already has the new `featured`).
	let current;
	try {
		current = featuredOf((await client.getFile(token, path)) ?? '');
	} catch (e) {
		return fail(502, { error: 'No pudimos leer el evento desde GitHub. Probá de nuevo.' });
	}
	if (isSharedAsset(current) && asked !== 'todas' && asked !== 'esta') {
		return fail(400, {
			error:
				'¿La imagen nueva es para todas las ediciones de este evento o solo para esta? Elegí una opción.'
		});
	}
	const scope = uploadScope(current, asked);
	if (scope === 'todas' && !isSafeAssetName(current)) {
		return fail(400, {
			error: `La imagen compartida «${current}» tiene un nombre raro y no se puede reemplazar desde acá. Elegí «Solo esta».`
		});
	}
	try {
		/** @type {import('$lib/server/eventos/github.js').CommitFile[]} */
		let files;
		/** @type {string[]} */
		let mustNotExist = [];
		/** @type {Array<{path: string, sha: string}>} */
		let unchanged;
		/** @type {import('$lib/utils/sharedImage.js').AffectedEvent[]} */
		let affected = [];
		let message;
		if (scope === 'todas') {
			const shared = await sharedAssetCommit(client, token, {
				oldName: current,
				ext: read.ext,
				base64: read.base64,
				override: { [path]: { text: content, sha } }
			});
			files = shared.commitFiles;
			mustNotExist = shared.mustNotExist;
			unchanged = shared.unchanged;
			affected = shared.affected;
			message =
				`[admin] ${userName} updated ${params.category}/${params.postID} ` +
				`y cambió la imagen compartida ${current} para todas las ediciones (${affected.length} eventos más)`;
		} else {
			const target = await ownImageTarget(client, token, params.postID, read.ext);
			files = [
				{ path, content: setFeatured(content, target.featured) },
				{ path: target.path, base64: read.base64 }
			];
			mustNotExist = [target.path];
			unchanged = [{ path, sha }];
			message = `[admin] ${userName} updated ${params.category}/${params.postID} (imagen nueva)`;
		}
		// The mock's sha is not a blob sha; its commitFiles ignores `unchanged` anyway.
		await client.commitFiles(token, { files, message, mustNotExist, unchanged });
		return {
			save: 'Guardado',
			imageScope: scope,
			affected,
			files: files.filter((f) => !f.delete).map((f) => f.path),
			deleted: files.filter((f) => f.delete).map((f) => f.path)
		};
	} catch (e) {
		console.log(e);
		if (e instanceof FileChangedError) {
			return fail(409, {
				error:
					'Alguien cambió este evento u otro que usa la misma imagen mientras tanto. Copiá tus cambios, recargá la página y volvé a intentar.'
			});
		}
		return fail(502, {
			error:
				'No se pudo guardar: ' +
				(e instanceof Error ? e.message : String(e)) +
				'. Copiá tus cambios, recargá la página y volvé a intentar.'
		});
	}
}

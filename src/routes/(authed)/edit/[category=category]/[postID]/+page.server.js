import { Buffer } from 'buffer';
import { error, fail } from '@sveltejs/kit';
import { ghGet, ghPut } from '$lib/external/github.js';
import { requireAdmin } from '$lib/server/auth';
import { editorData } from '$lib/server/admin/content.js';
import { getRepoClient, isMockMode } from '$lib/server/eventos';
import { validateEventTags } from '$lib/utils/adminTags.js';
import { readEventFields, splitMarkdown } from '$lib/utils/eventDraft.js';

/**
 * @param {{category: string, postID: string}} params
 */
function postPath(params) {
	return `src/lib/posts/${params.category}/${params.postID}.md`;
}

/** @type {import("./$types").PageServerLoad} */
export async function load({ locals, params, url }) {
	// Server loads run in parallel with the layout load, so guard here too.
	requireAdmin(locals, url);
	return {
		post: await getFileContent(locals.user_token, postPath(params)),
		// Tag usage, amigues profiles and past authors for the pickers.
		...(await editorData(params.category)),
		mock: isMockMode()
	};
}

/** @type {import("./$types").Actions} */
export const actions = {
	// Form actions do not run the (authed) layout load: each one must check auth.
	save: async ({ params, locals, request, url }) => {
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
		// Commit author label from the verified GitHub user; `name` is null for
		// accounts without a display name, so fall back to the login.
		const userName = user.name || user.login || 'admin';
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

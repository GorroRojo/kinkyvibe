import { Buffer } from 'buffer';
import { ghGet, ghPut } from '$lib/external/github.js';
import { requireAdmin } from '$lib/server/auth';

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
		post: await getFileContent(locals.user_token, postPath(params))
	};
}

/** @type {import("./$types").Actions} */
export const actions = {
	// Form actions do not run the (authed) layout load: each one must check auth.
	save: async ({ params, locals, request, url }) => {
		const user = requireAdmin(locals, url);
		const data = await request.formData();
		const fileContent = data.get('content');
		// Commit author label from the verified GitHub user; `name` is null for
		// accounts without a display name, so fall back to the login.
		const userName = user.name || user.login || 'admin';
		// @ts-ignore
		saveFileContent(locals.user_token, postPath(params), fileContent, data.get('sha'), userName, params.category, params.postID);
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
	let fileContent = await ghGet('repos/GorroRojo/kinkyvibe/contents/' + path, token);
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
	return await ghPut('repos/GorroRojo/kinkyvibe/contents/' + path, token, content, sha, userName, category, postID);
}

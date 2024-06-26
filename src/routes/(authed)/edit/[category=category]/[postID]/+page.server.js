import { Buffer } from 'buffer';
import { ghGet, ghPut } from '$lib/external/github.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ locals, params }) {
	return {
		post: await getFileContent(
			locals.user_token,
			`src/lib/posts/${params.category}/${params.postID}.md`
		)
	};
}

/** @type {import("./$types").Actions} */
export const actions = {
	save: async ({ params, cookies, request }) => {
		const token = cookies.get('userToken') ?? 'TOKEN NOT FOUND';
		const data = await request.formData();
		const fileContent = data.get('content');
		let userName = cookies.get('userName');
		if (userName == "null") userName = cookies.get('userLogin')
		// @ts-ignore
		saveFileContent(token, data.get('path') ?? '', fileContent, data.get('sha'), userName, params.category, params.postID);
		return { save: 'Guardado' };
	},
	load: async ({ cookies, request }) => {
		const token = cookies.get('userToken') || 'TOKEN NOT FOUND';
		const data = await request.formData();
		const fileContent = await getFileContent(
			token,
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

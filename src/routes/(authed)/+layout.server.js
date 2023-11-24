import { Buffer } from 'node:buffer';
import { redirect } from '@sveltejs/kit';
import { ghGet } from '$lib/external/github';
export async function load({ fetch, locals, url }) {
	if (locals.user_token == undefined || locals.user_token == '') {
		throw redirect(303, `/login?redirectTo=${url.pathname}`);
	} else {
		const tagsConfig = await (await fetch('/api?getTags')).json();
		return {
			currentRoute: url.pathname,
			tagsConfig,
			user: await getUser(locals.user_token),
			contents: await getFileContent(
				locals.user_token,
				'src/lib/posts/material/6-tips-para-tops.md'
			)
		};
	}
}

/**
 * @param {string} token
 * @return {Promise<GHUser>}
 */
async function getUser(token) {
	// @ts-ignore
	return await ghGet('user', token);
}
/**
 *
 * @param {string} token
 * @param {string} path
 * @returns {Promise<*>}
 */
async function getFileContent(token, path) {
	let fileContent = await ghGet('repos/GorroRojo/kinkyvibe/contents/' + path, token, true);
	let raw = Buffer.from(fileContent.content, fileContent.encoding).toString();
	return { raw, ...fileContent };
}

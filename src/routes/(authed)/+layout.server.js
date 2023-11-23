// @ts-nocheck
import { redirect } from '@sveltejs/kit';

export async function load({ locals, url }) {
	if (locals.user_token == undefined || locals.user_token == '') {
		throw redirect(303, `/login?redirectTo=${url.pathname}`);
	} else {
		return {
			user: await getUser(locals.user_token),
			contents: await getFileContent(locals.user_token, 'src/lib/posts/material/6-tips-para-tops.md')
		};
	}
}

/**
 * @param {string} token
 * @return {Promise<GHUser>}
 */
async function getUser(token) {
	// @ts-ignore
	return await github('user', token);
}
/**
 *
 * @param {string} token
 * @param {string} path
 * @returns {Promise<string>}
 */
async function getFileContent(token, path) {
	return await github('repos/GorroRojo/kinkyvibe/contents/' + path, token, true);
}

/**
 * Sends a request to the GitHub API using the specified method and token.
 *
 * @param {string} method - The method to be used in the API request.
 * @param {string} token - The token to be used for authentication.
 * @return {Promise<*>} A promise that resolves with the response data from the API.
 * @throws {Error} If the API request fails, an error is thrown with the corresponding status and status text.
 */
async function github(method, token, raw = false) {
	let response = await fetch('https://api.github.com/' + method, {
		headers: {
			'User-Agent': 'GorroRojo',
			Accept: raw ? 'application/vnd.github.raw+json' : 'application/json',
			Authorization: `Bearer ${token}`
		}
	});
	if (response.ok) {
		let ret = raw ? response.text() : response.json();
		// if (raw) console.log(ret)
		return ret;
	} else {
		throw new Error(
			`GitHub API Error when getting ${method}: ${response.status} ${response.statusText}`
		);
	}
}

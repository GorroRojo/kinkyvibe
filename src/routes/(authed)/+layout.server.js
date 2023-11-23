// @ts-nocheck
import { redirect } from '@sveltejs/kit';

export async function load({ locals, url }) {
	if (locals.user_token == undefined || locals.user_token == '') {
		throw redirect(303, `/login?redirectTo=${url.pathname}`);
	} else {
		return {
			user: await getUser(locals.user_token)
		};
	}
}

/**
 * @param {string} token
 * @return {GHUser}
 */
async function getUser(token) {
	// @ts-ignore
	return await github('user', token);
}

/**
 * Sends a request to the GitHub API using the specified method and token.
 *
 * @param {string} method - The method to be used in the API request.
 * @param {string} token - The token to be used for authentication.
 * @return {Promise<GHUser>} A promise that resolves with the response data from the API.
 * @throws {Error} If the API request fails, an error is thrown with the corresponding status and status text.
 */
async function github(method, token) {
	let response = await fetch('https://api.github.com/' + method, {
		headers: {
			'User-Agent': 'GorroRojo',
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		}
	});
	if (response.ok) {
		return await response.json();
	} else {
		throw new Error(
			`GitHub API Error when getting ${method}: ${response.status} ${response.statusText}`
		);
	}
}

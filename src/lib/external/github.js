import { utf8ToBase64 } from '$lib/utils/base64.js';

/**
 * Throws unless `endpoint` is a plain API path: letters, digits, `.`, `_`, `-` and `/`, with no
 * empty, `.` or `..` segments (so no query string, encoding or path normalization tricks).
 * @param {string} endpoint
 */
export function assertSafeEndpoint(endpoint) {
	if (
		typeof endpoint !== 'string' ||
		!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(endpoint) ||
		endpoint.split('/').some((s) => s === '.' || s === '..')
	) {
		throw new Error('Invalid GitHub API endpoint');
	}
}
/**
 * Sends a request to the GitHub API using the specified method and token.
 *
 * @param {string} endpoint - The method to be used in the API request.
 * @param {string} token - The token to be used for authentication.
 * @return {Promise<*>} A promise that resolves with the response data from the API.
 * @throws {Error} If the API request fails, an error is thrown with the corresponding status and status text.
 */
export async function ghGet(endpoint, token) {
	assertSafeEndpoint(endpoint);
	let response = await fetch('https://api.github.com/' + endpoint, {
		headers: {
			'User-Agent': 'GorroRojo',
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		}
	});
	if (response.ok) {
		let ret = response.json();
		return ret;
	} else {
		console.log(`GitHub API Error when getting ${endpoint}: ${response.status} ${response.statusText}`)
	}
}

/**
 * Sends a PUT request to the GitHub API with the specified endpoint, token, and body.
 *
 * @deprecated Writes straight to a branch, and main is protected: the panel publishes through
 * commitFiles in $lib/server/eventos/github.js (a PR that merges itself, see docs/publicar-contenido.md).
 * @param {string} endpoint - The endpoint to send the PUT request to.
 * @param {string} token - The authentication token to include in the request header.
 * @param {string} body - The body of the PUT request.
 * @param {string} sha
 * @return {Promise<*>} - A promise that resolves to the response from the GitHub API.
 */
export async function ghPut(endpoint, token, body, sha, userName = 'admin', category = '', postID = '') {
	assertSafeEndpoint(endpoint);
	let response = await fetch('https://api.github.com/' + endpoint, {
		method: 'PUT',
		headers: {
			'User-Agent': 'GorroRojo',
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			message: `[admin] ${userName} updated ${category}/${postID}`,
			content: utf8ToBase64(body),
			sha: sha
		})
	});
	if (response.ok) {
		let ret = response.json();
		return ret;
	} else {
		throw new Error(
			`GitHub API Error when putting ${endpoint}: ${response.status} ${response.statusText}`
		);
	}
}
export default ghGet;

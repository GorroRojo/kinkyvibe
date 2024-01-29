import { Buffer } from 'buffer';
/**
 * Sends a request to the GitHub API using the specified method and token.
 *
 * @param {string} endpoint - The method to be used in the API request.
 * @param {string} token - The token to be used for authentication.
 * @return {Promise<*>} A promise that resolves with the response data from the API.
 * @throws {Error} If the API request fails, an error is thrown with the corresponding status and status text.
 */
export async function ghGet(endpoint, token) {
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
		throw new Error(
			`GitHub API Error when getting ${endpoint}: ${response.status} ${response.statusText}`
		);
	}
}

/**
 * Sends a PUT request to the GitHub API with the specified endpoint, token, and body.
 *
 * @param {string} endpoint - The endpoint to send the PUT request to.
 * @param {string} token - The authentication token to include in the request header.
 * @param {string} body - The body of the PUT request.
 * @param {string} sha
 * @return {Promise<*>} - A promise that resolves to the response from the GitHub API.
 */
export async function ghPut(endpoint, token, body, sha) {
	let response = await fetch('https://api.github.com/' + endpoint, {
		method: 'PUT',
		headers: {
			'User-Agent': 'GorroRojo',
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		},
		body: JSON.stringify({
			message: 'admin: updated file',
			content: Buffer.from(body, 'utf-8').toString('base64'),
			sha: sha
		})
	});
	if (response.ok) {
		let ret = response.json();
		return ret;
	} else {
		throw new Error(
			`GitHub API Error when getting ${endpoint}: ${response.status} ${response.statusText}`
		);
	}
}
export default ghGet;

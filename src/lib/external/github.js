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
		console.log(
			`GitHub API Error when getting ${endpoint}: ${response.status} ${response.statusText}`
		);
	}
}

export default ghGet;

import { ghGet } from '$lib/external/github';
/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event: request, resolve }) {
	//@ts-ignore
	request.locals.user_token = request.cookies.get('userToken')
	request.locals.user = await getUser(request.locals.user_token)
	const response = await resolve(request);
	return response;
}

/**
 * @param {string} token
 * @return {Promise<GHUser>}
 */
async function getUser(token) {
	// @ts-ignore
	return await ghGet('user', token);
}
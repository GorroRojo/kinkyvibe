import { ghGet } from '$lib/external/github';
const EMPTY_USER = { login: '', name: '', avatar_url: '' };
/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event: request, resolve }) {
	//@ts-ignore
	let prevToken = request.cookies.get('prevToken');
	let token = request.cookies.get('userToken');
	let user = EMPTY_USER;
	if (token && token !== '' && token !== prevToken) {
		user = (await getUser(token)) ?? EMPTY_USER;
		request.locals.user = { login: user.login, name: user.name, avatar_url: user.avatar_url };
	} else if (token === '') {
		user = EMPTY_USER;
		request.locals.user = undefined;
	} else {
		user = {
			login: request.cookies.get('userLogin') ?? '',
			name: request.cookies.get('userName') ?? '',
			avatar_url: request.cookies.get('userAvatarUrl') ?? ''
		};
	}
	let { login, name, avatar_url } = user;
	request.cookies.set('userLogin', login, { path: '/' });
	request.cookies.set('userName', name, { path: '/' });
	request.cookies.set('userAvatarUrl', avatar_url, { path: '/' });
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

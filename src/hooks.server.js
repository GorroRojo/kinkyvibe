import { ghGet } from '$lib/external/github';
import { TOKEN_COOKIE, authCookieOptions } from '$lib/server/auth';
import { getVerifiedUser } from '$lib/server/session';

// Cookies from the old login flow. They were client-writable and must never be
// trusted; delete them if a browser still has them.
const LEGACY_COOKIES = ['prevToken', 'userLogin', 'userName', 'userAvatarUrl'];

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const token = event.cookies.get(TOKEN_COOKIE) ?? '';
	// Identity comes only from GitHub's answer for this token (cached server-side).
	const user = token ? await getVerifiedUser(token, getUser) : undefined;
	event.locals.user = user;
	event.locals.user_token = user ? token : '';

	for (const name of LEGACY_COOKIES) {
		if (event.cookies.get(name) !== undefined) {
			event.cookies.delete(name, authCookieOptions(event.url));
		}
	}

	return await resolve(event);
}

/**
 * @param {string} token
 * @return {Promise<GHUser|undefined>}
 */
async function getUser(token) {
	return await ghGet('user', token);
}

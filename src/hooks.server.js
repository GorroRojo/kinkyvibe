import { env } from '$env/dynamic/private';
import { ghGet } from '$lib/external/github';
import { TOKEN_COOKIE, adminByLogin, authCookieOptions } from '$lib/server/auth';
import { getVerifiedUser } from '$lib/server/session';

// Cookies from the old login flow. They were client-writable and must never be
// trusted; delete them if a browser still has them.
const LEGACY_COOKIES = ['prevToken', 'userLogin', 'userName', 'userAvatarUrl'];

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// DEV ONLY: fake admin session for exercising the admin pages without GitHub (see
	// src/lib/server/eventos/mock.js). `import.meta.env.DEV` is the literal `false` in
	// `vite build`, so this whole block is removed from production bundles.
	if (import.meta.env.DEV && env.ADMIN_DEV_MOCK === '1') {
		event.locals.user = { login: env.ADMIN_DEV_MOCK_LOGIN || 'GorroRojo', name: null, avatar_url: '' };
		event.locals.user_token = 'dev-mock';
		// Admin checks match the numeric GitHub id: borrow the listed admin's (0 = not an admin).
		const mockUser = /** @type {NonNullable<App.Locals['user']>} */ (event.locals.user);
		mockUser.id = adminByLogin(mockUser.login)?.id ?? 0;
		return await resolve(event);
	}
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

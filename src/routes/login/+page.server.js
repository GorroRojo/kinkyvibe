import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { authCookieOptions, safeRedirect } from '$lib/server/auth';
const target = 'https://github.com/login/oauth/authorize';
/** Seconds the user has to complete the GitHub authorization. */
const OAUTH_COOKIE_MAX_AGE = 10 * 60;
/** @type {import("./$types").Actions} */
export const actions = {
	default: async ({ request, cookies, url }) => {
		const data = await request.formData();
		const redirectTo = safeRedirect(data.get('redirectTo'), url.origin, '/');
		// Random, single-use state checked in /callback (OAuth CSRF protection).
		const bytes = crypto.getRandomValues(new Uint8Array(32));
		const state = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
		const opts = authCookieOptions(url, OAUTH_COOKIE_MAX_AGE);
		cookies.set('oauthState', state, opts);
		cookies.set('oauthRedirectTo', redirectTo, opts);
		const params = new URLSearchParams({
			client_id: env.GITHUB_CLIENT_ID ?? '',
			state,
			scope: 'repo'
		});
		throw redirect(302, `${target}?${params}`);
	}
};

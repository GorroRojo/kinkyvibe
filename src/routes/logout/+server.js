import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
import { TOKEN_COOKIE, authCookieOptions, revokeToken, safeRedirect } from '$lib/server/auth';
import { forgetUser } from '$lib/server/session';
import { confirmLogoutPage, isSameOriginNavigation, logoutRedirectTarget } from './logout.js';

/**
 * Logging out from a link on this site (or a typed URL) happens right away. A navigation that
 * started on another site gets a confirmation form instead, which POSTs back here.
 * @type {import('./$types').RequestHandler}
 */
export async function GET({ cookies, url, locals, request }) {
	const redirectTo = safeRedirect(logoutRedirectTarget(url), url.origin, '/admin');
	if (!isSameOriginNavigation(request.headers)) {
		return new Response(confirmLogoutPage(redirectTo), {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'no-store'
			}
		});
	}
	await logout(cookies, url, locals);
	redirect(302, redirectTo);
}

/**
 * The confirmation form. SvelteKit's origin check rejects cross-site form POSTs.
 * @type {import('./$types').RequestHandler}
 */
export async function POST({ cookies, url, locals, request }) {
	const data = await request.formData().catch(() => null);
	await logout(cookies, url, locals);
	redirect(303, safeRedirect(data?.get('redirectTo'), url.origin, '/admin'));
}

/**
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @param {URL} url
 * @param {App.Locals} locals
 */
async function logout(cookies, url, locals) {
	const token = cookies.get(TOKEN_COOKIE);
	await forgetUser(token);
	await revokeToken(token, {
		clientId: env.GITHUB_CLIENT_ID,
		clientSecret: env.GITHUB_CLIENT_SECRET
	});
	locals.user_token = '';
	locals.user = undefined;
	cookies.delete(TOKEN_COOKIE, authCookieOptions(url));
}

import { redirect } from '@sveltejs/kit';
import { TOKEN_COOKIE, authCookieOptions, safeRedirect } from '$lib/server/auth';
import { forgetUser } from '$lib/server/session';

/** @type {import('./$types').RequestHandler} */
export async function GET({ cookies, url, locals }) {
	await forgetUser(cookies.get(TOKEN_COOKIE));
	locals.user_token = '';
	locals.user = undefined;
	cookies.delete(TOKEN_COOKIE, authCookieOptions(url));
	redirect(302, safeRedirect(url.searchParams.get('redirectTo'), url.origin, '/admin'));
}

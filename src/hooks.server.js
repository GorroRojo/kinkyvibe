import { env } from '$env/dynamic/private';
import { ghGet } from '$lib/external/github';
import { TOKEN_COOKIE, adminByLogin, authCookieOptions } from '$lib/server/auth';
import { getVerifiedUser } from '$lib/server/session';
import { getDB } from '$lib/server/db';
import { PREVIEW_BUILD } from '$lib/server/deploy.js';
import { DEMO_COOKIE, DEMO_TOKEN, demoUser } from '$lib/server/demo/identity.js';
import { withSecurityHeaders } from '$lib/server/securityHeaders.js';
import { loadMember } from '$lib/server/cuentas/web.js';

// Cookies from the old login flow. They were client-writable and must never be
// trusted; delete them if a browser still has them.
const LEGACY_COOKIES = ['prevToken', 'userLogin', 'userName', 'userAvatarUrl'];

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// Cuentas del público (docs/cuentas.md): `locals.member`, aparte de `locals.user` (admins con
	// GitHub). Solo consulta algo si hay cookie de sesión y el interruptor está prendido.
	await loadMember(event);
	// DEV ONLY: fake admin session for exercising the admin pages without GitHub. Enabled by
	// `npm run dev:admin` (Vite mode "admin" loads ADMIN_DEV_MOCK=1 from .env.admin; see
	// src/lib/server/eventos/mock.js). `import.meta.env.DEV` is the literal `false` in
	// `vite build`, so this whole block is removed from production bundles.
	if (import.meta.env.DEV && env.ADMIN_DEV_MOCK === '1') {
		const login = env.ADMIN_DEV_MOCK_LOGIN || 'GorroRojo';
		// The real avatar, from the public github.com/<login>.png redirect, so the user menu looks
		// like it does with a real login (which gets avatar_url from GitHub's /user answer).
		event.locals.user = { login, name: null, avatar_url: `https://github.com/${login}.png` };
		event.locals.user_token = 'dev-mock';
		// Admin checks match the numeric GitHub id: borrow the listed admin's (0 = not an admin).
		const mockUser = /** @type {NonNullable<App.Locals['user']>} */ (event.locals.user);
		mockUser.id = adminByLogin(mockUser.login)?.id ?? 0;
		return withSecurityHeaders(event.url, await resolve(event));
	}
	// PREVIEW DEPLOYS ONLY: demo mode (docs/demo.md). PREVIEW_BUILD is a build-time constant
	// (false in the production build and locally), so this block is removed from production.
	// isAdmin also refuses the demo identity outside previews.
	if (PREVIEW_BUILD) {
		const { setDemoDB } = await import('$lib/server/demo/index.js');
		setDemoDB(getDB(event.platform));
		if (event.cookies.get(DEMO_COOKIE) === '1') {
			event.locals.user = demoUser();
			event.locals.user_token = DEMO_TOKEN;
			return withSecurityHeaders(event.url, await resolve(event));
		}
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

	return withSecurityHeaders(event.url, await resolve(event));
}

/**
 * @param {string} token
 * @return {Promise<GHUser|undefined>}
 */
async function getUser(token) {
	return await ghGet('user', token);
}

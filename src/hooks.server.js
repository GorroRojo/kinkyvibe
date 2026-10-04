import { env } from '$env/dynamic/private';
import { ghGet } from '$lib/external/github';
import { TOKEN_COOKIE, adminByLogin, authCookieOptions } from '$lib/server/auth';
import { getVerifiedUser } from '$lib/server/session';
import { getDB } from '$lib/server/db';
import { PREVIEW_BUILD, isPreviewDeploy } from '$lib/server/deploy.js';
import { DEMO_COOKIE, DEMO_TOKEN, demoUser } from '$lib/server/demo/identity.js';
import { withSecurityHeaders } from '$lib/server/securityHeaders.js';
import { loadMember } from '$lib/server/cuentas/web.js';
import { setContentDB } from '$lib/server/contenido/repo.js';
import { resolveAsPanelAuthor } from '$lib/server/contenido/author.js';
import { applySiteTags } from '$lib/server/etiquetas/source.js';

// Cookies from the old login flow. They were client-writable and must never be
// trusted; delete them if a browser still has them.
const LEGACY_COOKIES = ['prevToken', 'userLogin', 'userName', 'userAvatarUrl'];

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// Interruptor `contenido_db`: la base que usa el cliente del repo para los eventos de la base
	// (es la misma para todo el isolate, como la del modo demo).
	setContentDB(getDB(event.platform));
	// Interruptor `etiquetas_db` (docs/etiquetas.md): el árbol de etiquetas de este pedido (archivo o
	// base) pasa a ser el que usa todo el servidor. Nunca tira: sin base, el archivo.
	await applySiteTags(event.platform);
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
		return withSecurityHeaders(event.url, await resolveAsPanelAuthor(event, resolve));
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
			return withSecurityHeaders(event.url, await resolveAsPanelAuthor(event, resolve));
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

	return withSecurityHeaders(event.url, await resolveAsPanelAuthor(event, resolve));
}

/**
 * @param {string} token
 * @return {Promise<GHUser|undefined>}
 */
async function getUser(token) {
	return await ghGet('user', token);
}

/**
 * Solo en previews: el mensaje del error llega a la página de error, para poder diagnosticar el
 * modo demo sin acceso a los logs de Cloudflare (docs/demo.md). En el build de producción
 * `PREVIEW_BUILD` es `false`, así que `handleError` queda `undefined` y SvelteKit usa el suyo, como
 * siempre (mensaje genérico).
 *
 * @type {import('@sveltejs/kit').HandleServerError | undefined}
 */
export const handleError = PREVIEW_BUILD
	? ({ error, message }) => {
			console.error(error);
			if (!isPreviewDeploy()) return { message };
			const e = /** @type {any} */ (error);
			return { message: `${message}: ${e?.message ?? e}`.slice(0, 500) };
		}
	: undefined;

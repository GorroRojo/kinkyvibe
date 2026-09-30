import { error, redirect } from '@sveltejs/kit';
import { isPreviewDeploy } from './deploy.js';
import { isDemoUser } from './demo/identity.js';
import { loginHref } from '$lib/utils/authLinks.js';

/**
 * Accounts allowed into the admin area. Matched on the numeric GitHub user id, which never
 * changes; `login` is only a label for humans (usernames can be renamed and later taken by
 * someone else). Look ids up at https://api.github.com/users/<login>.
 * This is the single source of truth: pages get `user.admin` from the root layout load.
 */
export const ADMINS = Object.freeze([
	{ id: 4594048, login: 'GorroRojo' },
	{ id: 138258106, login: 'Tallarines333' },
	{ id: 45673502, login: 'VelvetVoid' }
]);

/** Name of the httpOnly cookie holding the GitHub OAuth token. */
export const TOKEN_COOKIE = 'userToken';

/**
 * @param {{ id?: number, login?: string }|undefined|null} user
 * @param {boolean} [preview] whether this is a Cloudflare Pages preview deploy. The demo admin
 *   (see $lib/server/demo/identity.js) is only accepted on previews, never in production.
 * @returns {boolean}
 */
export function isAdmin(user, preview = isPreviewDeploy()) {
	if (isDemoUser(user)) return preview === true;
	return (
		!!user &&
		typeof user.id === 'number' &&
		Number.isSafeInteger(user.id) &&
		ADMINS.some((a) => a.id === user.id)
	);
}

/**
 * The admin entry for a login, for the dev-only fake session.
 * @param {string} login
 */
export function adminByLogin(login) {
	return ADMINS.find((a) => a.login === login);
}

/**
 * Revokes a GitHub OAuth token (on logout). Best effort: a failure only means the token stays
 * valid until the user revokes it on GitHub, the cookie is deleted either way.
 * https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token
 * @param {string|undefined} token
 * @param {{ clientId?: string, clientSecret?: string }} app
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<boolean>} whether GitHub confirmed the revocation
 */
export async function revokeToken(token, { clientId, clientSecret }, fetchFn = fetch) {
	if (!token || !clientId || !clientSecret) return false;
	try {
		const res = await fetchFn(
			`https://api.github.com/applications/${encodeURIComponent(clientId)}/token`,
			{
				method: 'DELETE',
				headers: {
					Accept: 'application/vnd.github+json',
					'User-Agent': 'kinkyvibe',
					Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ access_token: token })
			}
		);
		return res.status === 204;
	} catch (e) {
		console.log('Could not revoke GitHub token: ' + e);
		return false;
	}
}

/**
 * Guard for server loads and form actions. Form actions do NOT run the
 * parent layout load, so every action must call this itself.
 * Throws a redirect to /login when there is no verified user, and a 403
 * error (rendered by the error page) when the verified user is not an admin,
 * so they see why they can't get in instead of landing on the home page.
 * @param {App.Locals} locals
 * @param {URL} url
 * @returns {NonNullable<App.Locals['user']>} the verified admin user
 */
export function requireAdmin(locals, url) {
	if (!locals.user || !locals.user_token) {
		// Ruta + query (ej. /admin/entradas/codigos?evento=x), validada como en /login.
		const back = safeRedirect(url.pathname + url.search, url.origin, '/admin');
		throw redirect(303, loginHref(new URL(back, url.origin)));
	}
	if (!isAdmin(locals.user)) {
		throw error(403, 'Tu cuenta no tiene permiso para entrar al panel de administración.');
	}
	return locals.user;
}

/**
 * Returns a same-origin path to redirect to, or `fallback` if `target` is
 * missing or could point to another origin. Accepts relative paths
 * ("/admin?x=1") and absolute URLs whose origin equals `origin`.
 * @param {unknown} target
 * @param {string} origin e.g. url.origin
 * @param {string} [fallback='/']
 * @returns {string}
 */
export function safeRedirect(target, origin, fallback = '/') {
	if (typeof target !== 'string' || target === '') return fallback;
	// Control characters (tab, newline...) are stripped by browsers, which can
	// turn "/\t/evil.com" into "//evil.com".
	// eslint-disable-next-line no-control-regex -- matching control characters is the point
	if (/[\u0000-\u001f\u007f]/.test(target)) return fallback;
	/** @type {URL} */
	let parsed;
	if (target.startsWith('/')) {
		if (target.startsWith('//') || target.startsWith('/\\')) return fallback;
		try {
			parsed = new URL(target, origin);
		} catch {
			return fallback;
		}
	} else {
		try {
			parsed = new URL(target);
		} catch {
			return fallback;
		}
	}
	if (parsed.origin !== origin) return fallback;
	return parsed.pathname + parsed.search + parsed.hash;
}

/**
 * Options for auth cookies. `secure` mirrors SvelteKit's default: off only for
 * http://localhost so the dev server keeps working.
 * @param {URL} url
 * @param {number} [maxAge] seconds
 */
export function authCookieOptions(url, maxAge) {
	/** @type {{path: string, httpOnly: boolean, secure: boolean, sameSite: 'lax', maxAge?: number}} */
	const opts = {
		path: '/',
		httpOnly: true,
		secure: !(url.hostname === 'localhost' && url.protocol === 'http:'),
		sameSite: 'lax'
	};
	if (maxAge) opts.maxAge = maxAge;
	return opts;
}

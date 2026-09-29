import { redirect } from '@sveltejs/kit';

/** GitHub logins allowed into the admin area. */
export const ADMINS = ['GorroRojo', 'Tallarines333', 'VelvetVoid'];

/** Name of the httpOnly cookie holding the GitHub OAuth token. */
export const TOKEN_COOKIE = 'userToken';

/**
 * @param {{ login?: string }|undefined|null} user
 * @returns {boolean}
 */
export function isAdmin(user) {
	return !!user && typeof user.login === 'string' && ADMINS.includes(user.login);
}

/**
 * Guard for server loads and form actions. Form actions do NOT run the
 * parent layout load, so every action must call this itself.
 * Throws a redirect to /login when there is no verified user, and to / when
 * the verified user is not an admin.
 * @param {App.Locals} locals
 * @param {URL} url
 * @returns {NonNullable<App.Locals['user']>} the verified admin user
 */
export function requireAdmin(locals, url) {
	if (!locals.user || !locals.user_token) {
		throw redirect(303, '/login?redirectTo=' + encodeURIComponent(url.pathname));
	}
	if (!isAdmin(locals.user)) {
		throw redirect(303, '/');
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

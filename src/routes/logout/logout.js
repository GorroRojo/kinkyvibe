import { escapeHtml } from '$lib/utils/escape.js';

/**
 * Helpers for /logout, kept apart from +server.js so they can be tested without SvelteKit.
 */

/**
 * Whether the browser says this navigation started on this site (a link or form here) or was
 * typed by the user. Missing header (old browsers, other clients) counts as not same-origin, so
 * they get the confirmation form.
 * @param {Headers} headers
 */
export function isSameOriginNavigation(headers) {
	const site = headers.get('sec-fetch-site');
	return site === 'same-origin' || site === 'none';
}

/**
 * The `redirectTo` query value. Links built without encoding it put the current page's own query
 * string after it (`/logout?redirectTo=/calendario?tags=a&q=b`), so when it is the first
 * parameter everything after it is the target. The result still goes through safeRedirect.
 * @param {URL} url
 * @returns {string|null}
 */
export function logoutRedirectTarget(url) {
	const prefix = '?redirectTo=';
	if (url.search.startsWith(prefix)) {
		const raw = url.search.slice(prefix.length);
		try {
			return decodeURIComponent(raw);
		} catch {
			return raw;
		}
	}
	return url.searchParams.get('redirectTo');
}

/**
 * A tiny standalone page asking to confirm the logout.
 * @param {string} redirectTo already checked with safeRedirect
 */
export function confirmLogoutPage(redirectTo) {
	const target = escapeHtml(redirectTo);
	return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Salir · Kinky Vibe</title>
<style>
body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:1rem;box-sizing:border-box;background:#fff;color:#222}
form{display:flex;flex-direction:column;gap:1rem;align-items:center;text-align:center}
button{font:inherit;padding:.5em 1.2em;border-radius:.4em;border:1px solid #222;background:#222;color:#fff;cursor:pointer}
a{color:inherit}
</style>
</head>
<body>
<form method="POST" action="/logout">
<p>¿Salir de Kinky Vibe?</p>
<input type="hidden" name="redirectTo" value="${target}">
<button type="submit">Salir</button>
<a href="${target}">Volver sin salir</a>
</form>
</body>
</html>
`;
}

import { env } from '$env/dynamic/private';
import { error, redirect } from '@sveltejs/kit';
import { TOKEN_COOKIE, authCookieOptions, safeRedirect } from '$lib/server/auth';
const clientId = env.GITHUB_CLIENT_ID;
const secret = env.GITHUB_CLIENT_SECRET;
const tokenURL = 'https://github.com/login/oauth/access_token';
/** @type {import('./$types').RequestHandler} */
export async function GET({ url, cookies }) {
	const expectedState = cookies.get('oauthState');
	const redirectTo = safeRedirect(cookies.get('oauthRedirectTo'), url.origin, '/');
	// The state is single-use: clear it whatever happens next.
	cookies.delete('oauthState', authCookieOptions(url));
	cookies.delete('oauthRedirectTo', authCookieOptions(url));

	const state = url.searchParams.get('state');
	if (!expectedState || !state || state !== expectedState) {
		error(400, 'Inicio de sesión inválido o vencido. Volvé a intentar desde /login.');
	}
	const code = url.searchParams.get('code');
	if (!code) {
		// e.g. the user cancelled the authorization on GitHub (?error=access_denied)
		redirect(302, '/login?redirectTo=' + encodeURIComponent(redirectTo));
	}
	let token;
	try {
		token = await getToken(code);
	} catch (e) {
		console.log(e);
		error(502, 'No se pudo iniciar sesión con GitHub. Volvé a intentar.');
	}
	if (!token) error(502, 'No se pudo iniciar sesión con GitHub. Volvé a intentar.');
	cookies.set(TOKEN_COOKIE, token, authCookieOptions(url));
	redirect(302, redirectTo);
}

/**
 *
 *
 * @param {string} code
 * @return {Promise<string>}
 */
function getToken(code) {
	return fetch(tokenURL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: secret,
			code: code
		})
	})
		.then((r) => r.json())
		.then((r) => {
			if (r.error) {
				throw new Error(
					'Error from GitHub API: \n' + r.error + '\n' + r.error_description + '\n' + r.error_uri
				);
			} else {
				return r.access_token;
			}
		})
		.catch((err) => {
			throw new Error('Error at getToken: ' + err);
		});
}

import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
const clientId = env.GITHUB_CLIENT_ID;
const secret = env.GITHUB_CLIENT_SECRET;
const tokenURL = 'https://github.com/login/oauth/access_token';
export async function GET(request) {
	const code = request.url.searchParams.get('code') ?? '';
	const token = await getToken(code);
	console.log("callback/token:",token)
	request.locals.user_token = token;
	request.cookies.set('prevToken', request.cookies.get('userToken') ?? '', { path: '/' });
	request.cookies.set('userToken', token, { path: '/' });
	throw redirect(302, '/');
}

/**
 *
 *
 * @param {string} code
 * @return {string}
 */
function getToken(code) {
	// @ts-ignore
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


// let i = {
// 	login: 'GorroRojo',
// 	id: 4594048,
// 	node_id: 'MDQ6VXNlcjQ1OTQwNDg=',
// 	avatar_url: 'https://avatars.githubusercontent.com/u/4594048?v=4',
// 	gravatar_id: '',
// 	url: 'https://api.github.com/users/GorroRojo',
// 	html_url: 'https://github.com/GorroRojo',
// 	organizations_url: 'https://api.github.com/users/GorroRojo/orgs',
// 	repos_url: 'https://api.github.com/users/GorroRojo/repos',
// 	type: 'User',
// 	name: 'Gorro_Rojo',
// 	company: null,
// 	blog: 'https://gorro.ar',
// 	email: 'gorro.rojo@gmail.com',
// };

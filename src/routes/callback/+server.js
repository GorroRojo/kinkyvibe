import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
const clientId = env.GITHUB_CLIENT_ID;
const secret = env.GITHUB_CLIENT_SECRET;
const tokenURL = 'https://github.com/login/oauth/access_token';
const userURL = 'https://api.github.com/user';
export async function GET(request) {
	// get accessToken
	const code = request.url.searchParams.get('code') ?? '';
    console.log("getting token from GH using code: " + code)
	const token = await getToken(code);
    console.log("getting user from GH using token: " + token)
	const user = await getUser(token);
    // @ts-ignore
    request.locals.user = user.login
	// return json(user);
    throw redirect(302,'/admin');
}
/**
 * @typedef {Object} GHUser
 * @property {string} login
 * @property {number} id
 * @property {string} node_id
 * @property {string} avatar_url
 * @property {string} gravatar_id
 * @property {string} url
 * @property {string} html_url
 * @property {string} followers_url
 * @property {string} following_url
 * @property {string} gists_url
 * @property {string} starred_url
 * @property {string} subscriptions_url
 * @property {string} organizations_url
 * @property {string} repos_url
 * @property {string} events_url
 * @property {string} received_events_url
 * @property {string} type
 * @property {boolean} site_admin
 * @property {string} name
 * @property {null|string} company
 * @property {string} blog
 * @property {string} location
 * @property {string} email
 * @property {boolean} hireable
 * @property {null|string} bio
 * @property {null|string} twitter_username
 * @property {number} public_repos
 * @property {number} public_gists
 * @property {number} followers
 * @property {number} following
 * @property {string} created_at
 * @property {string} updated_at
 */
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
		.then((r) => {
            console.log(r)
            return r.json()
        })
		.then((r) => {
            console.log(r)
            return r.access_token
        })
        .catch((err)=> {throw new Error("Error at getToken: "+err)});
}
/**
 *
 *
 * @param {string} token
 * @return {GHUser} 
 */
function getUser(token) {
	// @ts-ignore
	return fetch(userURL, {
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		}
	}).then((r) => r.json())
    .catch((err)=> {throw new Error("Error at getUser: "+err)});

}

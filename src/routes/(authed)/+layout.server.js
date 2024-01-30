import { redirect } from '@sveltejs/kit';
export async function load({ locals, url }) {
	if (locals.user_token == undefined || locals.user_token == '') {
		throw redirect(303, `/login?redirectTo=${url.pathname}`);
	} else if (locals.user?.login && !isAdmin(locals.user_token, locals.user.login)) {
		throw redirect(303, '/')
	} else {
		return {
			currentRoute: url.pathname,
		};
	}
}
/**
 *
 * @param {string} token
 * @param {string} username
 * @returns {Promise<*>}
 */
async function isAdmin(token, username) {
	return ["GorroRojo", "Tallarines333", "VelvetVoid"].includes(username)
	// TODO make it read it from github
	// try {
	// 	await ghGet(`repos/GorroRojo/kinkyvibe/collaborators/${username}}`, token)
	// } catch (e) {
	// 	console.log(e)
	// 	return false
	// }
	// return true
}

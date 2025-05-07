import { redirect } from '@sveltejs/kit';
export async function load({ locals, url }) {
	if (locals.user_token == undefined || locals.user_token == '') {
		return {
			currentRoute: url.pathname
		};
	} else if (isAdmin(locals.user_token, locals.user.login)) {
		return {
			currentRoute: url.pathname
		};
	} else {
		throw redirect(303, '/')
	}
}
/**
 *
 * @param {string} token
 * @param {string} username
 * @returns {Promise<*>}
 */
function isAdmin(token, username) {
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

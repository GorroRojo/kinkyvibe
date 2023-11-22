import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
const target = "https://github.com/login/oauth/authorize"
const clientId = env.GITHUB_CLIENT_ID

/** @type {import("./$types").PageServerLoad} */
export function load({locals}) {
	return {locals:JSON.stringify(locals)}
}

export const actions = {
	default: async ({ url }) => {
		const sessionId = '1234'
		throw redirect(302, `${target}?client_id=${clientId}&state=${sessionId}`)
	// 	throw redirect(303, url.searchParams.get('redirectTo') ?? '/');
	}
};

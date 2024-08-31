import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';
const target = 'https://github.com/login/oauth/authorize';
const clientId = env.GITHUB_CLIENT_ID;
/** @type {import("./$types").Actions} */
export const actions = {
	default: async ({ request }) => {
		const sessionId = '1234';
		const data = await request.formData();
		const redirectTo = data.get('redirectTo') ?? '/';
		redirect(
			302,
			`${target}?client_id=${clientId}&state=${sessionId}&scope=repo&redirectTo=${redirectTo}`
		);
		// 	throw redirect(303, url.searchParams.get('redirectTo') ?? '/');
	}
};

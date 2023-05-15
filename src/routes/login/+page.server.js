import { env } from '$env/dynamic/private';
import { redirect } from '@sveltejs/kit';

export const actions = {
	default: async ({ request, cookies, url }) => {
       let data = await request.formData();
       if (data.get("password") == env.PASSWORD) {
		cookies.set('logged_in', 'true', { path: '/' });
		throw redirect(303, url.searchParams.get('redirectTo') ?? '/');
       }
	}
};

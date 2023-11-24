import { redirect } from '@sveltejs/kit';
export const actions = {
	default: ({locals }) => {
      locals.user_token = undefined
		throw redirect(303, '/login');
	}
};

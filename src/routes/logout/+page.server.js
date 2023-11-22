// @ts-nocheck
import { redirect } from '@sveltejs/kit';
// export const ssr = false;
export const actions = {
	default: ({locals }) => {
      locals.user = undefined
		throw redirect(303, '/login');
	}
};

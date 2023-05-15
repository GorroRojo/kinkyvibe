// @ts-nocheck
import { redirect } from '@sveltejs/kit';
// export const ssr = false;
export const actions = {
	default: ({ cookies }) => {
		try {
           cookies.delete('logged_in', { path: '/' })
        } catch(e) {
           console.log(e)
        };
		throw redirect(303, '/');
	}
};

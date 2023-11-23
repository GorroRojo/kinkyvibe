// @ts-nocheck
import { redirect } from '@sveltejs/kit';

export function load({ locals, url }) {
	if (locals.user == undefined || locals.user == "") {
		throw redirect(303, `/login?redirectTo=${url.pathname}`);
	} else {
		return {
			user: locals.user
		}
	}
}
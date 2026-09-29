import { requireAdmin } from '$lib/server/auth';
/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals, url }) {
	requireAdmin(locals, url);
	return {
		currentRoute: url.pathname
	};
}

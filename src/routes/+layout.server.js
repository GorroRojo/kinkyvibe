import { fetchMarkdownPosts } from '$lib/utils';
import { isAdmin } from '$lib/server/auth';
/** @type {import("./$types").LayoutServerLoad} */
export const load = async ({ url, locals }) => {
	let wiki = await fetchMarkdownPosts(true);
	// let allPosts = await (await fetch('/api/posts')).json()
	// let wiki = await (await fetch('/api/wiki')).json();
	return {
		currentRoute: url.pathname,
		wiki,
		user: locals.user,
		// only decides what UI to show; admin routes/actions still check with requireAdmin
		isAdmin: isAdmin(locals.user)
	};
};

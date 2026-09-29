import { fetchMarkdownPosts } from '$lib/utils';
/** @type {import("./$types").LayoutServerLoad} */
// Don't read `url` here: SvelteKit would then re-run this load whenever the query string
// changes, e.g. on each PostList search update.
export const load = async ({ locals }) => {
	let wiki = await fetchMarkdownPosts(true);
	// let allPosts = await (await fetch('/api/posts')).json()
	// let wiki = await (await fetch('/api/wiki')).json();
	return {
		wiki,
		user: locals.user
	};
};

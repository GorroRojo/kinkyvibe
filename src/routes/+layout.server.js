import { fetchMarkdownPosts } from '$lib/utils';
/** @type {import("./$types").LayoutServerLoad} */
// Don't read `url` here: SvelteKit 1 would then re-run this load (and re-send every post)
// whenever the query string changes, e.g. on each PostList search update.
export const load = async ({ locals }) => {
	let allPosts = await fetchMarkdownPosts();
	let wiki = await fetchMarkdownPosts(true);
	// let allPosts = await (await fetch('/api/posts')).json()
	// let wiki = await (await fetch('/api/wiki')).json();
	return {
		allPosts,
		wiki,
		user: locals.user
	};
};

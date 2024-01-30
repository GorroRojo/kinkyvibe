// import { fetchMarkdownPosts } from '$lib/utils';
/** @type {import("./$types").LayoutServerLoad} */
export const load = async ({fetch, url, locals }) => {
	// let allPosts = await fetchMarkdownPosts();
	// let wiki = await fetchMarkdownPosts(true);
	let allPosts = await (await fetch('/api/posts')).json()
	let wiki = await (await fetch('/api/wiki')).json();
	return {
		currentRoute: url.pathname,
		allPosts,
		wiki,
		user: locals.user
	};
};

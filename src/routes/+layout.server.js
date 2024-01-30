import { fetchMarkdownPosts } from '$lib/utils';
/** @type {import("./$types").LayoutServerLoad} */
export const load = async ({fetch, url, locals }) => {
	let t1 = Date.now();
	let allPosts = await fetchMarkdownPosts();
	let wiki = await fetchMarkdownPosts(true);
	let t2 = Date.now();
	console.log('calling time:', t2 - t1);
	// t1 = Date.now();
	// allPosts = await (await fetch('/api/posts')).json()
	// wiki = await (await fetch('/api/wiki')).json();
	// t2 = Date.now();
	// console.log('fetching time:', t2 - t1);
	return {
		currentRoute: url.pathname,
		allPosts,
		wiki,
		user: locals.user
	};
};

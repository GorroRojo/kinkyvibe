import { fetchMarkdownPosts } from '$lib/utils';
/** @type {import("./$types").LayoutServerLoad} */
export const load = async ({ url, locals }) => {
	return {
		currentRoute: url.pathname,
		allPosts: await fetchMarkdownPosts(),
		wiki: await fetchMarkdownPosts(true),
		user: locals.user
	};
};

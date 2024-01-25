import { fetchMarkdownPosts } from "$lib/utils";

/** @type {import("./$types").LayoutLoad} */
export const load = async ({ url }) => {
	return { currentRoute: url.pathname, allPosts: await fetchMarkdownPosts(), wiki: await fetchMarkdownPosts(true) };
};

import { fetchMarkdownPosts } from "$lib/utils";

export async function load() {
	const unlisted_posts = fetchMarkdownPosts(false, true);
	return {
		unlisted_posts
	};
}

import { fetchMarkdownPosts } from '$lib/utils/index.js';

export async function load() {
	let posts, err;
	try {
		posts = await fetchMarkdownPosts()
	} catch (e) {
		err = e;
	}
	return { posts: posts, err };
}

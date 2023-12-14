import { fetchMarkdownPosts } from '$lib/utils/index.js';

export async function load() {
	try {
		const posts = await fetchMarkdownPosts();
		return { posts };
	} catch (err) {
		return { isError: true, err };
	}
}

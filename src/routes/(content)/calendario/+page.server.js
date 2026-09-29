import { fetchMarkdownPosts } from '$lib/utils';

/** @type {import("./$types").PageServerLoad} */
export async function load() {
	const posts = await fetchMarkdownPosts();
	return { posts: posts.filter((p) => p.meta.layout == 'calendario') };
}

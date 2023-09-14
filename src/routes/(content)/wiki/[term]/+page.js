import { fetchMarkdownPosts, fetchPost } from '$lib/utils/index.js';
export const prerender = 'auto';
/** @type {import("./$types").PageLoad} */
export async function load({ params }) {
	let post = await fetchPost('wiki', params.term);
	return {
		entries: await fetchMarkdownPosts(true),
		...post
	};
}

import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params }) {
	let post;
	try {
		post = await fetchPost('material', params.post, true);
	} catch (e) {
		// missing/unpublished posts are handled by +page.js
		return { relatedPosts: [], relatedPastCount: 0 };
	}
	return currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts()));
}

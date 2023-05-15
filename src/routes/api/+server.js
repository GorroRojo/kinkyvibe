// @ts-nocheck
import { error, json } from '@sveltejs/kit';
import { fetchMarkdownPosts } from '$lib/utils';

export async function GET() {
	var allPosts;
	try {
		allPosts = await fetchMarkdownPosts();
	} catch (err) {
		throw error(400, err);
	}
	const sortedPosts = allPosts.sort((a, b) => new Date(b.meta.date) - new Date(a.meta.date));
	return json(sortedPosts);
}

// @ts-nocheck
/** @type {import('./$types').RequestHandler} */
import { json } from '@sveltejs/kit';
import { fetchMarkdownPosts } from '$lib/utils';

export async function GET() {
	const allPosts = await fetchMarkdownPosts();
	const sortedPosts = allPosts.sort((a, b) => {
		return new Date(b.meta.date) - new Date(a.meta.date);
	});
	return json(sortedPosts);
}
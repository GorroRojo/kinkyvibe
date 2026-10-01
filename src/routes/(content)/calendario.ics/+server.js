import { fetchMarkdownPosts } from '$lib/utils';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';

// content only changes on deploy: build it once as a static file
export const prerender = true;

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	const allPosts = await fetchMarkdownPosts();
	return new Response(buildIcsFeed(allPosts), {
		headers: { 'Content-Type': 'text/calendar' }
	});
}

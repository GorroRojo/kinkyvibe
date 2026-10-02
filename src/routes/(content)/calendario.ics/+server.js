import { fetchMarkdownPosts } from '$lib/utils';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';

// Not prerendered: whether KinkyVibe organizes an event comes from its tags, which follow the
// `etiquetas_db` switch (the file or the database, docs/etiquetas.md); the database can't be read
// at build time.
export const prerender = false;

/** @type {import('./$types').RequestHandler} */
export async function GET() {
	const allPosts = await fetchMarkdownPosts();
	return new Response(buildIcsFeed(allPosts), {
		headers: { 'Content-Type': 'text/calendar', ...TAGGED_CACHE }
	});
}

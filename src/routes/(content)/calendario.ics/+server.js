import { sitePosts } from '$lib/server/contenido/posts.js';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';

// Not prerendered: with the `contenido_db` switch on the events come from the database and can
// change without a deploy, and whether KinkyVibe organizes an event comes from its tags, which
// follow the `etiquetas_db` switch (docs/etiquetas.md); the database can't be read at build time.
export const prerender = false;

/** @type {import('./$types').RequestHandler} */
export async function GET({ platform }) {
	const allPosts = await sitePosts(platform);
	return new Response(buildIcsFeed(allPosts), {
		headers: { 'Content-Type': 'text/calendar', ...TAGGED_CACHE }
	});
}

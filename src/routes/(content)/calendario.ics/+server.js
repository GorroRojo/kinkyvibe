import { sitePosts } from '$lib/server/contenido/posts.js';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';
import { getDB } from '$lib/server/db';
import { feedVenues } from '$lib/server/amigues/venues.js';

// Not prerendered: the events come from the database and can change without a deploy, and
// whether KinkyVibe organizes an event comes from its tags, also in the database
// (docs/etiquetas.md); the database can't be read at build time.
export const prerender = false;

/** @type {import('./$types').RequestHandler} */
export async function GET({ platform }) {
	const allPosts = await sitePosts(platform);
	// Un lugar vinculado manda sobre el «Dónde» del .md, como en la página y en los otros .ics
	// (`feedLocation`): lo que la página del evento le muestra a cualquiera.
	const venues = await feedVenues(
		getDB(platform),
		allPosts.filter((p) => p.meta.category === 'calendario').map((p) => String(p.meta.postID))
	);
	return new Response(buildIcsFeed(allPosts, { venues }), {
		headers: { 'Content-Type': 'text/calendar; charset=utf-8', ...TAGGED_CACHE }
	});
}

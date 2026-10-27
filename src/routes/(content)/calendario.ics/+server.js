import { sitePosts } from '$lib/server/contenido/posts.js';
import { buildIcsFeed, icsResponse, publicIcsSince } from '$lib/utils/icsFeed.js';
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
	// De los pasados, solo los de los últimos 90 días (`publicIcsSince`, docs/seo.md). Con
	// `max-age=900` como los .ics por etiqueta: un calendario suscripto lo baja cada hora.
	return icsResponse(buildIcsFeed(allPosts, { venues, since: publicIcsSince() }));
}

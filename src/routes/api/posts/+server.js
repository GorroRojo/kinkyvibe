import { json } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';

// Not prerendered: with the `contenido_db` switch on the events come from the database and can
// change without a deploy, and the posts' tags follow the `etiquetas_db` switch
// (docs/etiquetas.md); the database can't be read at build time.
export const prerender = false;

/** @type {import("./$types").RequestHandler} */
export async function GET({ platform }) {
	// Un lugar vinculado manda sobre el «Dónde» del .md (como en la página del evento).
	const posts = await withVenuePlaces(getDB(platform), await sitePosts(platform));
	return json(posts, { headers: TAGGED_CACHE });
}

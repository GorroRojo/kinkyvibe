import { json } from '@sveltejs/kit';
import { fetchMarkdownPosts } from '$lib/utils';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';

// Not prerendered: the posts' tags follow the `etiquetas_db` switch (the file or the database,
// docs/etiquetas.md), and the database can't be read at build time. The processed list is
// cached per server instance (fetchMarkdownPosts), so each request only serializes it.
export const prerender = false;

/** @type {import("./$types").RequestHandler} */
export async function GET({ platform }) {
	// Un lugar vinculado manda sobre el «Dónde» del .md (como en la página del evento).
	const posts = await withVenuePlaces(getDB(platform), await fetchMarkdownPosts());
	return json(posts, { headers: TAGGED_CACHE });
}

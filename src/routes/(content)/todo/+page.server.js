import { fetchCurrentPosts } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	// Un lugar vinculado manda sobre el «Dónde» del .md.
	return { posts: await withVenuePlaces(getDB(platform), await fetchCurrentPosts()) };
}

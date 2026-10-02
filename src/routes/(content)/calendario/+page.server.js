import { sitePosts } from '$lib/server/contenido/posts.js';
import { isCurrent } from '$lib/utils/allPosts';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

// all the calendar grid (and a collapsed past-events list) uses; the page loads
// the full posts if the viewer chooses to list past events
const PAST_EVENT_FIELDS = [
	'title',
	'start',
	'end',
	'tags',
	'featured',
	'status',
	'layout',
	'category',
	'postID',
	'redirect',
	'mark'
];

/**
 * @param {AnyPostData} meta
 * @returns {AnyPostData}
 */
const slimMeta = (meta) => {
	/** @type {Record<string, any>} */
	const m = meta;
	return /** @type {AnyPostData} */ (
		Object.fromEntries(PAST_EVENT_FIELDS.filter((k) => k in m).map((k) => [k, m[k]]))
	);
};

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	const now = Date.now();
	const posts = (await sitePosts(platform)).filter((p) => p.meta.layout == 'calendario');
	// Un lugar vinculado manda sobre el «Dónde» del .md (los pasados ya van sin él).
	const current = new Map(
		(
			await withVenuePlaces(
				getDB(platform),
				posts.filter((p) => isCurrent(p, now))
			)
		).map((p) => [p.path, p])
	);
	return {
		posts: posts.map(
			(p) => current.get(p.path) ?? /** @type {ProcessedPost} */ ({ ...p, meta: slimMeta(p.meta) })
		),
		// «Comprar entradas» / «Agotadas» en las tarjetas: todos los eventos en una consulta.
		ticketStates: await ticketStatesFor(platform, posts)
	};
}

import { currentRelated, fetchPost } from '$lib/utils';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { tagIdFromSlug } from '$lib/utils/tagSlug.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { getDB } from '$lib/server/db';
import { relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { stripMdPlace } from '$lib/utils/eventPlace.js';
import { building } from '$app/environment';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform }) {
	// El árbol de etiquetas en uso (la base).
	const tagManager = await siteTagManager(platform);
	let term = '';
	/** @type {string[]} */
	let children = [];
	/** @type {Omit<ProcessedPost, 'content'>|{}} */
	let post = {};
	try {
		// The content component can't be serialized, so +page.js loads it on its own.
		// eslint-disable-next-line no-unused-vars
		const { content, ...rest } = await fetchPost('wiki', params.term);
		post = rest;
		const wiki = rest.meta.wiki;
		term = wiki ?? '';
		children = tagManager.get(wiki ?? '')?.getAllChildren() ?? [];
	} catch (e) {
		// no wiki entry: the page falls back to the tag of the same name (see +page.js), resolved
		// from the URL form ("Rancheadita-Kinky", aliases) like every other tag route.
		term = tagIdFromSlug(tagManager, params.term) ?? params.term;
	}
	const posts = await sitePosts(platform);
	const current = currentRelated(
		posts.filter((p) => p.meta.tags.includes(term) || children.some((c) => p.meta.tags.includes(c)))
	);
	// Un lugar vinculado manda sobre el «Dónde» del .md de cada evento. Al prerenderizar no hay
	// base para saber qué eventos tienen lugar: van todos sin el «Dónde» (las tarjetas no lo usan).
	const related = building
		? {
				...current,
				relatedPosts: current.relatedPosts.map((p) =>
					p.meta?.category === 'calendario' ? { ...p, meta: stripMdPlace(p.meta) } : p
				)
			}
		: await relatedWithVenuePlaces(getDB(platform), current);
	return {
		...post,
		...related,
		// «Comprar entradas» / «Agotadas» en las tarjetas (prerenderizada: `null`, link a /entradas).
		ticketStates: await ticketStatesFor(platform, related.relatedPosts)
	};
}

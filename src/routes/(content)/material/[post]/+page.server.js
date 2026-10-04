import { currentRelated, relatedPostsFor } from '$lib/utils';
import { mentionPronouns } from '$lib/server/pronouns';
import { error, redirect } from '@sveltejs/kit';
import { siteContent, sitePosts } from '$lib/server/contenido/posts.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { personasForPage } from '$lib/server/personas/index.js';
import { getDB } from '$lib/server/db';
import { relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, locals, setHeaders }) {
	// El post de la base (con su texto ya armado); si la base no lo tiene, o quien mira no lo puede
	// ver, 404.
	const found = await siteContent(platform, 'material', params.post, { viewer: viewerFor(locals) });
	if (!found) error(404, 'Not found');
	if (found.meta.force_unpublished) setHeaders({ 'cache-control': 'private, no-store' });
	const { html, css, component, parts, ...post } = found;
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	const posts = await sitePosts(platform);
	// Un lugar vinculado manda sobre el «Dónde» del .md de cada evento.
	const related = await relatedWithVenuePlaces(
		getDB(platform),
		currentRelated(relatedPostsFor(post.meta, posts))
	);
	return {
		...post,
		html,
		css,
		component,
		parts: parts ?? null,
		...related,
		// «Comprar entradas» / «Agotadas» en las tarjetas de "Más cosas de…".
		ticketStates: await ticketStatesFor(platform, related.relatedPosts),
		pronouns: await mentionPronouns(platform, posts),
		// Personas con su rol (`null` si no hay nada que mostrar).
		personas: await personasForPage(platform, post.meta)
	};
}

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
	// La lista de publicaciones (para "Más cosas de…" y los pronombres) se lee a la par del post: la
	// base está lejos y cada consulta que espera a otra es una ida y vuelta más. Con un 404 o una
	// redirección nadie la espera: que un error suyo no quede sin atender (más abajo se espera la
	// original, que sigue tirando como antes).
	const postsP = sitePosts(platform);
	postsP.catch(() => {});
	// El post de la base (con su texto ya armado); si la base no lo tiene, o quien mira no lo puede
	// ver, 404.
	const found = await siteContent(platform, 'material', params.post, { viewer: viewerFor(locals) });
	if (!found) error(404, 'Not found');
	if (found.meta.force_unpublished) setHeaders({ 'cache-control': 'private, no-store' });
	const { html, css, parts, ...post } = found;
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	const posts = await postsP;
	const related = currentRelated(relatedPostsFor(post.meta, posts));
	// Lo demás, a la par. La venta mira solo qué eventos son y cuándo empiezan (el lugar vinculado
	// cambia el «Dónde», nada más): no espera a los lugares.
	const [withPlaces, ticketStates, pronouns, personas] = await Promise.all([
		// Un lugar vinculado manda sobre el «Dónde» del .md de cada evento.
		relatedWithVenuePlaces(getDB(platform), related),
		// «Comprar entradas» / «Agotadas» en las tarjetas de "Más cosas de…".
		ticketStatesFor(platform, related.relatedPosts),
		mentionPronouns(platform, posts),
		// Personas con su rol (`null` si no hay nada que mostrar).
		personasForPage(platform, post.meta)
	]);
	return {
		...post,
		html,
		css,
		parts: parts ?? null,
		...withPlaces,
		ticketStates,
		pronouns,
		personas
	};
}

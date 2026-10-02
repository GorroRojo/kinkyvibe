import { currentRelated, fetchPost, relatedPostsFor } from '$lib/utils';
import { mentionPronouns } from '$lib/server/pronouns';
import { propinasEnabled } from '$lib/server/flags.js';
import { isKinkyVibePost } from '$lib/utils/propinas.js';
import { error, redirect } from '@sveltejs/kit';
import { siteContent, sitePosts } from '$lib/server/contenido/posts.js';
import { viewerFor } from '$lib/server/amigues/profiles.js';
import { personasForPage } from '$lib/server/personas/index.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform, locals, setHeaders }) {
	// Interruptor `contenido_db`: el post de la base (con su texto ya armado), si la base tiene esa
	// dirección; oculto o borrado → 404 aunque el .md siga.
	const found = await siteContent(platform, 'material', params.post, { viewer: viewerFor(locals) });
	if (found.mode === 'db' && !found.post) error(404, 'Not found');
	const db = found.mode === 'db' ? found.post : null;
	if (db?.meta.force_unpublished) setHeaders({ 'cache-control': 'private, no-store' });
	// 404s for missing/unpublished posts. The content component can't be serialized,
	// so +page.js loads it on its own.
	// eslint-disable-next-line no-unused-vars
	const { content, ...post } = db ?? (await fetchPost('material', params.post));
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	const related = currentRelated(relatedPostsFor(post.meta, await sitePosts(platform)));
	return {
		...post,
		...(db
			? {
					mode: /** @type {const} */ ('db'),
					html: db.html,
					css: db.css,
					component: db.component
				}
			: { mode: /** @type {const} */ ('md'), html: undefined, css: '', component: false }),
		...related,
		// «Comprar entradas» / «Agotadas» en las tarjetas de "Más cosas de…".
		ticketStates: await ticketStatesFor(platform, related.relatedPosts),
		pronouns: await mentionPronouns(),
		// Personas con su rol (interruptor `personas_eventos`; apagado, `null`).
		personas: await personasForPage(platform, post.meta),
		// Interruptor `propinas`: bloque de propina en lugar de la nota del cafecito.
		propinas: isKinkyVibePost(post.meta) ? await propinasEnabled(platform) : false
	};
}

import { currentRelated } from '$lib/utils';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { siteWikiEntry, wikiPost } from '$lib/server/wiki/site.js';
import { renderContentBody } from '$lib/server/contenido/render.js';

/**
 * /wiki/<término>: la página de la wiki de esa etiqueta, desde la base (el texto de la wiki es el
 * cuerpo de la etiqueta: src/lib/server/wiki/site.js). Se arma en cada pedido (ya no se
 * prerenderiza: la base no se puede leer al compilar). Sin página de la wiki, la página muestra la
 * etiqueta (+page.js). Los .md de src/lib/posts/wiki/ quedan solo como respaldo: el sitio no los
 * lee.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ params, platform }) {
	const { entry, key, tags } = await siteWikiEntry(platform, params.term);
	const children = tags.get(key)?.getAllChildren() ?? [];
	const posts = await sitePosts(platform);
	const current = currentRelated(
		posts.filter((p) => p.meta.tags.includes(key) || children.some((c) => p.meta.tags.includes(c)))
	);
	// Un lugar vinculado manda sobre el «Dónde» del .md de cada evento.
	const related = await relatedWithVenuePlaces(getDB(platform), current);
	/**
	 * La página de la wiki (sin página: nada, y +page.js muestra la etiqueta).
	 * @type {{ meta?: Record<string, any>, path?: string, html?: string, css?: string, parts?: import('$lib/server/contenido/interactive.js').Part[] | null }}
	 */
	let page = {};
	if (entry) {
		const post = wikiPost(entry, tags);
		// Lo importado del repo (o guardado por une superadmin) con HTML libre, como lo armaba mdsvex;
		// lo demás, con la lista corta (src/lib/server/contenido/render.js).
		const body = await renderContentBody(
			{ body: entry.body, body_html: entry.bodyHtml },
			'wiki',
			entry.slug,
			{ vars: post.meta }
		);
		page = { ...post, html: body.html, css: body.css, parts: body.parts ?? null };
	}
	return {
		...page,
		...related,
		// «Comprar entradas» / «Agotadas» en las tarjetas.
		ticketStates: await ticketStatesFor(platform, related.relatedPosts)
	};
}

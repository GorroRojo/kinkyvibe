import { currentRelated } from '$lib/utils';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { siteWikiEntry, wikiPost } from '$lib/server/wiki/site.js';
import { renderContentBody } from '$lib/server/contenido/render.js';
import { pageReadingMinutes, pageReadingWords } from '$lib/utils/readingTime.js';
import { seriesTagInfo } from '$lib/server/series/web.js';
import { followButtonState } from '$lib/server/sigo/button.js';

/**
 * /wiki/<término>: la página de la wiki de esa etiqueta, desde la base (el texto de la wiki es el
 * cuerpo de la etiqueta: src/lib/server/wiki/site.js). Se arma en cada pedido (ya no se
 * prerenderiza: la base no se puede leer al compilar). Sin página de la wiki, la página muestra la
 * etiqueta (+page.js). Los .md de src/lib/posts/wiki/ quedan solo como respaldo: el sitio no los
 * lee.
 *
 * Lo de series de la etiqueta y el botón «Seguir» vienen con la página (`seriesInfo`, `follow`),
 * así no se piden al cargar y la página no se mueve cuando llegan. Si algo de eso falla, la página
 * sale igual sin ellos (`undefined`), y los componentes lo piden como antes.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ params, platform, locals }) {
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
	 * @type {{ meta?: Record<string, any>, path?: string, html?: string, css?: string, parts?: import('$lib/server/contenido/interactive.js').Part[] | null, readingMinutes?: number, readingWords?: number }}
	 */
	let page = {};
	if (entry) {
		const post = wikiPost(entry, tags);
		// Con `wiki_body_html: 'libre'` guardado (lo importado o lo que guardó une superadmin), HTML
		// libre, como lo armaba mdsvex; lo demás (sin valor también), con la lista corta
		// (src/lib/server/contenido/render.js).
		const body = await renderContentBody(
			{ body: entry.body, body_html: entry.bodyHtml },
			'wiki',
			entry.slug,
			{ vars: post.meta }
		);
		page = {
			...post,
			html: body.html,
			css: body.css,
			parts: body.parts ?? null,
			// «X min de lectura» del texto guardado (0 si es corto): $lib/utils/readingTime.js.
			readingMinutes: pageReadingMinutes(entry.body),
			// Las palabras, para recalcular con la velocidad de cada persona en el navegador.
			readingWords: pageReadingWords(entry.body)
		};
	}
	const [ticketStates, seriesInfo, follow] = await Promise.all([
		// «Comprar entradas» / «Agotadas» en las tarjetas.
		ticketStatesFor(platform, related.relatedPosts),
		seriesTagInfo(platform, locals, key, { tags, posts }).catch(logged('series')),
		followButtonState({ platform, locals }, 'etiqueta', key, { tags }).catch(logged('sigo'))
	]);
	return { ...page, ...related, ticketStates, seriesInfo, follow };
}

/**
 * Lo opcional de la página: si falla, sale sin eso (`undefined`) y el componente lo pide solo.
 *
 * @param {string} what
 */
function logged(what) {
	/** @param {unknown} e */
	return (e) => {
		console.error(`[wiki] ${what}:`, e);
		return undefined;
	};
}

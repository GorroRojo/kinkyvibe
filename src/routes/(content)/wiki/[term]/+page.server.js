import { error, redirect } from '@sveltejs/kit';
import { currentRelated } from '$lib/utils';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { askVenuePlacesEarly, relatedWithVenuePlaces } from '$lib/server/amigues/venues.js';
import { askTicketStatesEarly, ticketStatesFor } from '$lib/server/tickets/listStates.js';
import { siteWikiEntry, siteWikiPosts, wikiPost } from '$lib/server/wiki/site.js';
import { siteTagDetails } from '$lib/server/etiquetas/source.js';
import { renderContentBody } from '$lib/server/contenido/render.js';
import { pageReadingMinutes, pageReadingWords } from '$lib/utils/readingTime.js';
import { seriesTagInfo } from '$lib/server/series/web.js';
import { followButtonState } from '$lib/server/sigo/button.js';
import { linksHere } from '$lib/server/contenido/loQueEnlaza.js';

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
export async function load({ params, platform, locals, url, request }) {
	const { entry, key, tags, known, fromDb, canonicalPath, canonicalTerm } = await siteWikiEntry(
		platform,
		params.term
	);
	// Un término que no es ninguna etiqueta: 404 de verdad (antes era una página vacía con 200, que
	// los buscadores toman como «soft 404»). Solo si el árbol salió de la base: sin base, el árbol es
	// el de respaldo (vacío) y una caída no tiene que convertir toda la wiki en 404.
	if (!known && fromDb) error(404, 'Not found');
	// Las otras formas de la dirección (/wiki/bdsm, /wiki/Bdsm, un alias, con espacios) van con un
	// 301 a la canónica, con la misma consulta. Se compara el segmento ya decodificado (`params`), así
	// %C3%A9 y «é» son lo mismo. Con la misma guarda que el 404: sin base, nunca.
	if (
		fromDb &&
		known &&
		canonicalTerm !== null &&
		params.term !== canonicalTerm &&
		(request.method === 'GET' || request.method === 'HEAD')
	)
		redirect(301, canonicalPath + url.search);
	// «Lo que enlaza acá» (interruptor `lo_que_enlaza`), a la par de la lista. Nunca tira.
	const linksHereP = linksHere(platform, locals, { tag: key });
	const children = tags.get(key)?.getAllChildren() ?? [];
	/** @param {ProcessedPost[]} list */
	const relatedOf = (list) =>
		currentRelated(
			list.filter((p) => p.meta.tags.includes(key) || children.some((c) => p.meta.tags.includes(c)))
		);
	// La venta y los lugares de las tarjetas, a la par de la lista (con lo que ya tiene el isolate).
	askTicketStatesEarly(platform, (list) => relatedOf(list).relatedPosts);
	askVenuePlacesEarly(getDB(platform));
	const posts = await sitePosts(platform);
	const current = relatedOf(posts);
	// A la par (cada consulta a la base es una vuelta): el lugar no cambia la venta de entradas.
	const ticketStatesP = ticketStatesFor(platform, current.relatedPosts);
	ticketStatesP.catch(() => {});
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
	const [ticketStates, seriesInfo, follow, wiki, details, linksHereList] = await Promise.all([
		// «Comprar entradas» / «Agotadas» en las tarjetas.
		ticketStatesP,
		seriesTagInfo(platform, locals, key, { tags, posts }).catch(logged('series')),
		followButtonState({ platform, locals }, 'etiqueta', key, { tags }).catch(logged('sigo')),
		// El glosario de la página: las páginas de la wiki y las descripciones y relacionadas de las
		// etiquetas (el layout raíz manda el árbol liviano: $lib/utils/tagDetails.js).
		siteWikiPosts(platform),
		siteTagDetails(platform),
		linksHereP
	]);
	return {
		...page,
		...related,
		// La canónica: la misma para /wiki/bondage, /wiki/Bondage y /wiki/BONDAGE (o un alias).
		canonicalPath,
		ticketStates,
		seriesInfo,
		follow,
		wiki,
		siteTagDetails: details,
		linksHere: linksHereList
	};
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

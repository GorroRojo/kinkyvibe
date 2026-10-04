/**
 * La Kinkipedia para el sitio: las páginas de la wiki salen solo de la base (el texto de la wiki
 * de cada etiqueta, src/lib/server/etiquetas/wikiPages.js), nunca de los .md del repo. Sin base (o
 * con la base sin etiquetas) no hay páginas de la wiki; `/wiki/<término>` muestra la etiqueta.
 *
 * Las páginas vienen con el árbol de etiquetas (una sola lectura, recordada 30 s por isolate:
 * src/lib/server/etiquetas/source.js), así el glosario del layout no suma consultas.
 */
import { canonicalTags } from '$lib/utils';
import { tagIdFromSlug } from '$lib/utils/tagSlug.js';
import { siteTagSource, tagManagerOf } from '$lib/server/etiquetas/source.js';

/** @typedef {import('$lib/server/etiquetas/wikiPages.js').WikiEntry} WikiEntry */

/**
 * Una página de la wiki con la forma de un post (`ProcessedPost`), como la daba su .md: lo usan el
 * glosario, el buscador, el sitemap, «Participa en» y la página misma.
 *
 * @param {WikiEntry} entry
 * @param {TagManager} tagManager
 * @returns {ProcessedPost}
 */
export function wikiPost(entry, tagManager) {
	return /** @type {ProcessedPost} */ (
		/** @type {unknown} */ ({
			path: `/wiki/${entry.slug}`,
			meta: {
				title: entry.title,
				wiki: entry.key,
				summary: entry.summary,
				tags: canonicalTags(entry.tags, tagManager),
				authors: entry.authors,
				layout: 'wiki',
				category: 'wiki',
				postID: entry.slug
			},
			authorsProfiles: []
		})
	);
}

/** @type {WeakMap<object, ProcessedPost[]>} */
const postsBySource = new WeakMap();

/**
 * Las páginas de la wiki como posts (sin el texto). Vacío sin base.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<ProcessedPost[]>}
 */
export async function siteWikiPosts(platform) {
	const source = await siteTagSource(platform);
	let posts = postsBySource.get(source);
	if (!posts) {
		const tags = tagManagerOf(source);
		posts = (source.wiki ?? []).map((e) => wikiPost(e, tags));
		postsBySource.set(source, posts);
	}
	// Quien llama puede ordenar la lista: una copia.
	return [...posts];
}

/**
 * El texto (markdown) de cada página de la wiki, por dirección (`/wiki/<dirección>`), para el
 * índice del buscador.
 *
 * @param {App.Platform | undefined} platform
 * @returns {Promise<Map<string, string>>}
 */
export async function siteWikiBodies(platform) {
	const source = await siteTagSource(platform);
	return new Map((source.wiki ?? []).map((e) => [`/wiki/${e.slug}`, e.body]));
}

/**
 * La página de la wiki a la que lleva un segmento de `/wiki/<término>` (la etiqueta, también por
 * un alias o sin mayúsculas, como toda dirección de una etiqueta), con su árbol; `entry` es `null`
 * si esa etiqueta no tiene página de la wiki.
 *
 * @param {App.Platform | undefined} platform
 * @param {string} term
 * @returns {Promise<{ entry: WikiEntry | null, key: string, tags: TagManager }>}
 */
export async function siteWikiEntry(platform, term) {
	const source = await siteTagSource(platform);
	const tags = tagManagerOf(source);
	const key = tagIdFromSlug(tags, term) ?? term;
	const entry = (source.wiki ?? []).find((e) => e.key === key || e.slug === term) ?? null;
	return { entry, key: entry?.key ?? key, tags };
}

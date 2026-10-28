/**
 * La Kinkipedia para el sitio: las páginas de la wiki salen solo de la base (el texto de la wiki
 * de cada etiqueta, src/lib/server/etiquetas/wikiPages.js), nunca de los .md del repo. Sin base (o
 * con la base sin etiquetas) no hay páginas de la wiki; `/wiki/<término>` muestra la etiqueta.
 *
 * Las páginas vienen con el árbol de etiquetas (una sola lectura, recordada 30 s por isolate:
 * src/lib/server/etiquetas/source.js), así el glosario del layout no suma consultas.
 */
import { canonicalTags } from '$lib/utils';
import { tagIdFromSlug, tagSlug } from '$lib/utils/tagSlug.js';
import { tagPagePath } from '$lib/utils/series.js';
import { siteTagDetails, siteTagSource, tagManagerOf } from '$lib/server/etiquetas/source.js';

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
 * Para las listas que muestran la descripción de las etiquetas elegidas (/material, /amigues,
 * /todo): las etiquetas con página de la wiki (el link «Es más complejo») y los detalles de las
 * etiquetas (el layout raíz manda el árbol liviano: $lib/utils/tagDetails.js).
 *
 * @param {App.Platform | undefined} platform
 */
export async function tagDescriptionsData(platform) {
	const [wiki, details] = await Promise.all([siteWikiPosts(platform), siteTagDetails(platform)]);
	return { wikiKeys: wiki.map((p) => String(p.meta.wiki)), siteTagDetails: details };
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
 * - `known`: el segmento nombra una etiqueta del árbol (o una página de la wiki).
 * - `fromDb`: el árbol salió de la base. Sin base (o sin poder leerla) el árbol es el de respaldo,
 *   vacío: ahí nada es `known`, y la página no tiene que dar 404 por eso.
 * - `canonicalPath`: la dirección canónica (`/wiki/<slug>` de la etiqueta), igual para todas las
 *   formas que llevan a la misma etiqueta (mayúsculas, espacios, alias).
 * - `canonicalTerm`: el segmento de esa dirección (sin codificar), solo si lleva de vuelta a la
 *   misma página; si no (dos etiquetas con el mismo slug, por ejemplo), `null`, y la página no
 *   redirige (así nunca hay un ida y vuelta).
 *
 * @param {App.Platform | undefined} platform
 * @param {string} term
 * @returns {Promise<{ entry: WikiEntry | null, key: string, tags: TagManager, known: boolean, fromDb: boolean, canonicalPath: string, canonicalTerm: string | null }>}
 */
export async function siteWikiEntry(platform, term) {
	const source = await siteTagSource(platform);
	const tags = tagManagerOf(source);
	/** @param {string} segment */
	const resolve = (segment) => {
		const id = tagIdFromSlug(tags, segment);
		const key = id ?? segment;
		const entry = (source.wiki ?? []).find((e) => e.key === key || e.slug === segment) ?? null;
		return { id, entry, key: entry?.key ?? key };
	};
	const { id, entry, key } = resolve(term);
	const slug = tagSlug(key);
	return {
		entry,
		key,
		tags,
		known: Boolean(entry) || id !== null,
		fromDb: source.fromDb,
		canonicalPath: tagPagePath(key),
		canonicalTerm: slug === term || resolve(slug).key === key ? slug : null
	};
}

/**
 * De las etiquetas de una página de detalle (evento, material, perfil), las que tienen algo propio
 * en la Kinkipedia: una página de la wiki o una descripción. Sus chips llevan a `/wiki/<etiqueta>`
 * en vez de filtrar `/todo` (`wikiTags` de Tags.svelte); las demás, cuya página sería genérica,
 * siguen filtrando. Se decide en el servidor: el árbol que llega al navegador no trae las
 * descripciones, y el link tiene que ser el mismo antes y después de hidratar. Sin base, ninguna.
 *
 * @param {App.Platform | undefined} platform
 * @param {readonly unknown[] | null | undefined} tagIds
 * @returns {Promise<string[]>}
 */
export async function wikiLinkedTags(platform, tagIds) {
	const ids = (tagIds ?? []).filter((t) => typeof t === 'string' && t !== '');
	if (!ids.length) return [];
	const source = await siteTagSource(platform);
	if (!source.fromDb) return [];
	const tags = tagManagerOf(source);
	const withEntry = new Set((source.wiki ?? []).map((e) => e.key));
	return /** @type {string[]} */ (
		[...new Set(ids)].filter((id) => {
			const tag = tags.get(/** @type {string} */ (id));
			if (!tag || tag.orphan) return false;
			return withEntry.has(tag.id) || String(tag.description ?? '').trim() !== '';
		})
	);
}

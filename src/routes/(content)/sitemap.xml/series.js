import { parseSiteDate } from '$lib/utils/dates.js';
import { seriesEditions, seriesTagIds, tagPagePath } from '$lib/utils/series.js';
import { siteWikiPosts } from '$lib/server/wiki/site.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';

/**
 * Las páginas de la wiki y, después, las de las series ({@link seriesSitemapPosts}): el grupo
 * «wiki» del sitemap. La lista pública y las etiquetas ya están recordadas en el isolate (el
 * sitemap pide la misma lista): no suma consultas.
 *
 * @param {App.Platform | undefined} platform
 */
export async function sitemapWikiPosts(platform) {
	const [wiki, posts, tags] = await Promise.all([
		siteWikiPosts(platform),
		sitePosts(platform),
		siteTagManager(platform)
	]);
	return [
		...wiki,
		...seriesSitemapPosts(
			tags,
			posts,
			wiki.map((p) => p.path)
		)
	];
}

/**
 * Las páginas de las series para el sitemap (/wiki/<serie>), como posts para `render`: solo las
 * series con al menos una edición en `posts` (la lista pública: la que ve cualquiera sin sesión) y
 * que no estén ya (`taken`: una serie con entrada de la Kinkipedia ya va con la wiki). La fecha es
 * la más nueva de sus ediciones (actualización o publicación), si alguna la tiene.
 *
 * @param {TagManager} tags el árbol de etiquetas en uso
 * @param {readonly Pick<ProcessedPost, 'meta' | 'path'>[]} posts
 * @param {Iterable<string>} [taken] direcciones que ya están en el sitemap
 * @returns {{ path: string, meta: { updated_date?: string } }[]}
 */
export function seriesSitemapPosts(tags, posts, taken = []) {
	const seen = new Set(taken);
	/** @type {{ path: string, meta: { updated_date?: string } }[]} */
	const out = [];
	for (const id of seriesTagIds(tags)) {
		const editions = seriesEditions(posts, id);
		if (!editions.length) continue;
		const path = tagPagePath(id);
		if (seen.has(path)) continue;
		seen.add(path);
		const slugs = new Set(editions.map((e) => e.slug));
		let newest = -Infinity;
		for (const p of posts) {
			if (p.meta?.category !== 'calendario' || !slugs.has(String(p.meta.postID))) continue;
			const t = parseSiteDate(p.meta.updated_date ?? p.meta.published_date).getTime();
			if (t > newest) newest = t;
		}
		out.push({
			path,
			meta: Number.isFinite(newest) ? { updated_date: new Date(newest).toISOString() } : {}
		});
	}
	return out;
}

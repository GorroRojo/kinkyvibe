import { inSitemap } from '$lib/utils/seo.js';

export const siteURL = 'https://kinkyvibe.ar';

/**
 * @param {string|Date|undefined} d
 * @returns {Date|undefined} undefined for missing or invalid dates
 */
export function parseDate(d) {
	if (d === undefined || d === null || d === '') return undefined;
	const parsed = new Date(d + '');
	// new Date() never throws: it returns an Invalid Date for missing/bad values
	return isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Newest first; posts without a date go last.
 * @param {ProcessedPost[]} posts
 */
export function sortByPublished(posts) {
	const time = (/** @type {ProcessedPost} */ p) =>
		parseDate(p.meta.published_date)?.getTime() ?? -Infinity;
	return posts.sort((a, b) => time(b) - time(a));
}

/**
 * Sin `<priority>` (Google la ignora) y con `lastmod` solo si se conoce de verdad: una fecha que
 * cambia en cada pedido hace que Google deje de confiar en los `lastmod` del sitemap.
 * @param {string} loc
 * @param {Date|undefined} lastmod omitted from the entry when undefined
 */
const url = (loc, lastmod) =>
	`<url>
    <loc>${siteURL}${loc}</loc>${
			lastmod
				? `
    <lastmod>${lastmod.toISOString()}</lastmod>`
				: ''
		}
</url>`;

/**
 * @param {ProcessedPost} post
 * @returns {Date|undefined}
 */
const postDate = (post) => parseDate(post.meta.updated_date ?? post.meta.published_date);

/**
 * El `lastmod` de una página fija: la fecha más nueva de lo que lista (`/calendario` → sus
 * eventos), o ninguna si no es la lista de una sección (`/`, `/wiki`).
 * @param {string} page
 * @param {ProcessedPost[]} posts ya sin los que redirigen
 * @returns {Date|undefined}
 */
export function sectionLastmod(page, posts) {
	if (page === '/' || page === '/wiki') return undefined;
	const prefix = page + '/';
	/** @type {Date|undefined} */
	let newest;
	for (const post of posts) {
		if (!post.path.startsWith(prefix)) continue;
		const date = postDate(post);
		if (date && (!newest || date > newest)) newest = date;
	}
	return newest;
}

/**
 * @param {string[]} pages static pages, relative to the site root (the root itself is `/`)
 * @param {ProcessedPost[]} posts calendario, amigues and material posts (the ones with `redirect`
 *   are left out: their URL answers 307 to another site, so search engines can't index it; and so
 *   are the profiles that asked not to appear in search engines, `noindex`)
 * @param {ProcessedPost[]} wikiPosts Kinkipedia entries
 * @returns {string}
 */
export const render = (pages, posts, wikiPosts) => {
	const listed = posts.filter(inSitemap);
	return `<?xml version="1.0" encoding="UTF-8" ?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${pages.map((p) => url(p, sectionLastmod(p, listed))).join('\n')}
${listed.map((post) => url(post.path, postDate(post))).join('\n')}
${wikiPosts.map((post) => url(post.path, postDate(post))).join('\n')}
</urlset>
`;
};

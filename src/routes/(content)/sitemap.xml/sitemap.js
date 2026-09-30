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
 * @param {string} loc
 * @param {string} priority
 * @param {Date|undefined} lastmod omitted from the entry when undefined
 */
const url = (loc, priority, lastmod) =>
	`<url>
    <loc>${siteURL}${loc}</loc>
    <priority>${priority}</priority>${
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
 * @param {string[]} pages static pages, relative to the site root
 * @param {ProcessedPost[]} posts calendario, amigues and material posts
 * @param {ProcessedPost[]} wikiPosts Kinkipedia entries
 * @param {Date} [now]
 * @returns {string}
 */
export const render = (pages, posts, wikiPosts, now = new Date()) =>
	`<?xml version="1.0" encoding="UTF-8" ?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${url('', '1', now)}
${pages.map((p) => url(p, '0.8', now)).join('\n')}
${posts.map((post) => url(post.path, '0.6', postDate(post) ?? now)).join('\n')}
${wikiPosts.map((post) => url(post.path, '0.5', postDate(post))).join('\n')}
</urlset>
`;

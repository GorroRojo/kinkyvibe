import { fetchMarkdownPosts } from '$lib/utils';
const siteURL = 'https://kinkyvibe.ar';
const siteTitle = 'KinkyVibe';
const siteDescription = 'Your site description here';

export const prerender = true;

export const GET = async () => {
	const allPosts = await fetchMarkdownPosts();
	const time = (/** @type {ProcessedPost} */ p) => new Date(p.meta.published_date).getTime() || 0;
	const sortedPosts = allPosts.sort((a, b) => time(b) - time(a));

	const body = render(sortedPosts);
	const options = {
		headers: {
			'Cache-Control': 'max-age=0, s-maxage=3600',
			'Content-Type': 'application/xml'
		}
	};

	return new Response(body, options);
};

/** @param {*} s */
const escapeXML = (s) =>
	(s + '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

/** @param {*} d */
const pubDate = (d) => {
	const date = new Date(d);
	return isNaN(date.getTime()) ? '' : `\n<pubDate>${date.toUTCString()}</pubDate>`;
};

/** @param {ProcessedPost[]} posts */
const render = (posts) => `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${siteTitle}</title>
<description>${siteDescription}</description>
<link>${siteURL}</link>
<atom:link href="${siteURL}/rss" rel="self" type="application/rss+xml"/>
${posts
	.map(
		(/** @type {ProcessedPost} */ post) => `<item>
<guid isPermaLink="true">${siteURL}${post.path}</guid>
<title>${escapeXML(post.meta.title)}</title>
<link>${siteURL}${post.path}</link>
<description>${escapeXML(post.meta.title)}</description>${pubDate(post.meta.published_date)}
</item>`
	)
	.join('')}
</channel>
</rss>
`;

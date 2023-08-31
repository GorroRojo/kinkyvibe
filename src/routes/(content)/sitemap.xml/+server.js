//@ts-nocheck
import { fetchMarkdownPosts } from '$lib/utils';
const siteURL = 'https://kinkyvibe.ar';
// const siteTitle = 'KinkyVibe';
// const siteDescription = 'Your site description here';

export const prerender = true;

/** @type {import('./$types').RequestHandler} */
export const GET = async () => {
	const allPosts = await fetchMarkdownPosts();
	const sortedPosts = allPosts.sort((a, b) => new Date(b.date) - new Date(a.date));
	const pages = ['', 'material', 'calendario', 'amigues', 'wiki'];
	const body = render(pages, sortedPosts);
	const options = {
		headers: {
			'Cache-Control': 'max-age=0, s-maxage=3600',
			'Content-Type': 'application/xml'
		}
	};

	return new Response(body, options);
};

const render = (pages, posts) =>
	`<?xml version="1.0" encoding="UTF-8" ?>
<urlset
      xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
<url>
    <loc>${siteURL}</loc>
    <priority>1</priority>
    <lastmod>${new Date().toISOString()}</lastmod>
</url>
${pages.map(
	(p) =>
		`<url>
    <loc>${siteURL}/${p}</loc>
    <priority>0.8</priority>
    <lastmod>${new Date().toISOString()}</lastmod>
</url>`
)}
${posts
    .map(
        (post) =>
    `<url>
    <loc>${siteURL}/${post.path}</loc>
    <lastmod>${new Date(post.meta.updated_date ?? post.meta.published_date).toISOString()}</lastmod>
    <priority>0.6</priority>
</url>`
).join('')}
</urlset>
`;
{
	/* 
<title>${post.meta.title}</title>
<link>${siteURL}/${post.path}</link>
<description>${post.meta.title}</description>
<channel>
<title>${siteTitle}</title>
<description>${siteDescription}</description>
<link>${siteURL}</link>
<atom:link href="${siteURL}/rss.xml" rel="self" type="application/rss+xml"/>
</channel>
</rss> */
}

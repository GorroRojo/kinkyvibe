import { fetchMarkdownPosts } from '$lib/utils';
const siteURL = 'https://kinkyvibe.ar';
// const siteTitle = 'KinkyVibe';
// const siteDescription = 'Your site description here';
// TODO add wiki entries to sitemap
// export const prerender = true;

/** @type {import('./$types').RequestHandler} */
export const GET = async () => {
	const allPosts = await fetchMarkdownPosts();
	const sortedPosts = allPosts.sort((a, b) => (new Date(b.meta.published_date+"")).getTime() - (new Date(a.meta.published_date+"")).getTime());
	const pages = ['/', '/material', '/calendario', '/amigues', '/wiki', '/todo'];
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
    <loc>${siteURL}${p}</loc>
    <priority>0.8</priority>
    <lastmod>${new Date().toISOString()}</lastmod>
</url>`
)}
${posts
    .map(
        (post) =>
    `<url>
    <loc>${siteURL}${post.path}</loc>
    <lastmod>${new Date(post.meta.updated_date ?? post.meta.published_date).toISOString()}</lastmod>
    <priority>0.6</priority>
</url>`
).join('')}
</urlset>
`;

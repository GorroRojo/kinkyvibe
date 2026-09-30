import { fetchMarkdownPosts } from '$lib/utils';
import { render, sortByPublished } from './sitemap.js';
// content only changes on deploy: build it once as a static file
export const prerender = true;

/** @type {import('./$types').RequestHandler} */
export const GET = async () => {
	const [posts, wikiPosts] = await Promise.all([fetchMarkdownPosts(), fetchMarkdownPosts(true)]);
	const pages = ['/', '/material', '/calendario', '/amigues', '/wiki', '/todo'];
	const body = render(pages, sortByPublished(posts), wikiPosts);
	const options = {
		headers: {
			'Cache-Control': 'max-age=0, s-maxage=3600',
			'Content-Type': 'application/xml'
		}
	};

	return new Response(body, options);
};

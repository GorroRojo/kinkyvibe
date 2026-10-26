// El grupo «wiki» del sitemap: las páginas de la wiki y las de las series con ediciones públicas
// (./series.js).
import { sitemapWikiPosts as siteWikiPosts } from './series.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { render, sortByPublished } from './sitemap.js';
// Dinámico (antes se prerenderizaba): los eventos y el material salen de la base y pueden cambiar
// sin un deploy.

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ platform }) => {
	const [posts, wikiPosts] = await Promise.all([sitePosts(platform), siteWikiPosts(platform)]);
	// Sin /todo: junta las otras tres listas y va con `noindex` (docs/seo.md, «Sitemap»).
	const pages = ['/', '/material', '/calendario', '/amigues', '/wiki'];
	const body = render(pages, sortByPublished(posts), wikiPosts);
	const options = {
		headers: {
			'Cache-Control': 'max-age=0, s-maxage=3600',
			'Content-Type': 'application/xml'
		}
	};

	return new Response(body, options);
};

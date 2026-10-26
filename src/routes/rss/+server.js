/** /rss: el RSS 2.0 de siempre (lo anuncia src/app.html). Cómo se arma: ./rss.js. */
import { sitePosts } from '$lib/server/contenido/posts.js';
import { feedPosts } from '$lib/utils/feeds.js';
import { RSS_EVENTS, RSS_MATERIAL, render } from './rss.js';

// Dinámico (antes se prerenderizaba): los eventos y el material salen de la base y pueden cambiar
// sin un deploy.

/** @param {{ platform?: App.Platform }} [event] */
export const GET = async (event) => {
	const allPosts = await sitePosts(event?.platform);
	const posts = [
		...feedPosts(allPosts, { categories: ['calendario'], limit: RSS_EVENTS }),
		...feedPosts(allPosts, { categories: ['material'], limit: RSS_MATERIAL })
	];
	const body = render(posts);
	const options = {
		headers: {
			'Cache-Control': 'max-age=0, s-maxage=3600',
			'Content-Type': 'application/xml'
		}
	};

	return new Response(body, options);
};

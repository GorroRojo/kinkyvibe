import { sitePosts } from '$lib/server/contenido/posts.js';
const siteURL = 'https://kinkyvibe.ar';
const siteTitle = 'KinkyVibe';
const siteDescription =
	'Divulgación disidente, producción de eventos y talleres, gestión comunitaria y editorial. Información y encuentros cuir LGTBQIA+ kinky y de BDSM.';

/**
 * Items that exist only in the feed (not on the site). Used on 2026-09-29 to apologize after
 * fixing the feed: it used to be invalid XML (unescaped `&` in titles), and once it parsed,
 * feed readers showed every old post as new. Remove this item after a few weeks.
 */
const FEED_ONLY_ITEMS = [
	{
		guid: `${siteURL}/rss#perdon-por-el-spam-2026-09`,
		link: siteURL,
		title: 'Ups perdón usuaries de RSS, juro que es por una buena causa!',
		description:
			'Estamos haciendo grandes y super importantes cambios en el sitio y uno fue un arreglo al RSS que gatilló todos esos posts que te llegaron recién. Mala mía perdón. Pero te doy exclusiva para recompensar: muy pronto vas a poder comprar las entradas para los eventos directo desde el sitio! Sin más google forms que andan flojos ni tener que mandar comprobantes. Eso y mucho más se vieneee. Gracias por seguirnos por acá, me intriga muchísimo quiénes realmente usan RSS con el sitio jsaj. -gorrite',
		date: '2026-09-29T19:00:00-03:00',
		// Drops out of the feed after this date.
		until: '2026-10-27T00:00:00-03:00'
	}
];

/** How many posts the feed lists (newest first), like most sites do. */
const FEED_LIMIT = 50;

// Dinámico (antes se prerenderizaba): los eventos y el material salen de la base y pueden cambiar
// sin un deploy.

/** @param {{ platform?: App.Platform }} [event] */
export const GET = async (event) => {
	const allPosts = await sitePosts(event?.platform);
	const time = (/** @type {ProcessedPost} */ p) =>
		new Date(p.meta.published_date ?? '').getTime() || 0;
	const sortedPosts = allPosts.sort((a, b) => time(b) - time(a));

	const body = render(sortedPosts.slice(0, FEED_LIMIT));
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
${FEED_ONLY_ITEMS.filter((item) => Date.now() < new Date(item.until).getTime())
	.map(
		(item) => `<item>
<guid isPermaLink="false">${escapeXML(item.guid)}</guid>
<title>${escapeXML(item.title)}</title>
<link>${escapeXML(item.link)}</link>
<description>${escapeXML(item.description)}</description>${pubDate(item.date)}
</item>`
	)
	.join('')}${posts
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

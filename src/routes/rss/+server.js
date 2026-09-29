import { fetchMarkdownPosts } from '$lib/utils';
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
		title: 'Perdón por la avalancha 🙈 (y lo que se viene)',
		description:
			'Si te llegaron de golpe un montón de publicaciones viejas de KinkyVibe: perdón, fuimos nosotres. Estamos renovando la página por dentro y, al arreglar este feed, tu lector tomó todo como nuevo. No tenés que hacer nada, ya no va a volver a pasar. Lo bueno: se viene una KinkyVibe más linda, más rápida y con cosas nuevas (spoiler: vas a poder sacar entradas para nuestros eventos directo desde la web). Gracias por seguirnos por acá 💜',
		date: '2026-09-29T19:00:00-03:00'
	}
];

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
${FEED_ONLY_ITEMS.map(
	(item) => `<item>
<guid isPermaLink="false">${escapeXML(item.guid)}</guid>
<title>${escapeXML(item.title)}</title>
<link>${escapeXML(item.link)}</link>
<description>${escapeXML(item.description)}</description>${pubDate(item.date)}
</item>`
).join('')}${posts
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

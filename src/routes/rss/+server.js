/**
 * /rss: el RSS 2.0 de siempre (lo anuncia src/app.html). Los eventos y el material más nuevos, con
 * el mismo texto que los feeds Atom y JSON Feed (src/lib/utils/feeds.js): el resumen (del evento,
 * la fecha adelante, nunca el lugar), autores, etiquetas e idioma. Solo publicaciones listadas y
 * públicas (`sitePosts`), sin las que redirigen a otro sitio (docs/seo.md).
 */
import { sitePosts } from '$lib/server/contenido/posts.js';
import { escapeXml, feedEntry, feedPosts, rfc3339 } from '$lib/utils/feeds.js';
const siteURL = 'https://kinkyvibe.ar';
const siteTitle = 'Kinky Vibe';
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

/** Cuántos eventos y cuántos materiales lista el feed (los más nuevos de cada uno). */
export const RSS_EVENTS = 30;
export const RSS_MATERIAL = 20;

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

/** Una fecha en el formato de RSS (RFC 822), o nada. @param {unknown} d */
const rssDate = (d) => {
	const iso = rfc3339(d);
	return iso ? new Date(iso).toUTCString() : '';
};

/** @param {unknown} d */
const pubDate = (d) => {
	const date = rssDate(d);
	return date ? `\n<pubDate>${date}</pubDate>` : '';
};

/**
 * @param {ProcessedPost[]} posts
 * @param {number} [now] para publicaciones sin ninguna fecha
 */
export const render = (posts, now = 0) => {
	const entries = posts
		.map((post) => feedEntry(post, now))
		.sort((a, b) => (b.published ?? b.updated).localeCompare(a.published ?? a.updated));
	// La fecha del feed: la más nueva de sus entradas (no «ahora»: el mismo contenido, el mismo XML).
	const newest = entries
		.map((e) => e.updated)
		.sort()
		.at(-1);
	return `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>${siteTitle}</title>
<description>${siteDescription}</description>
<link>${siteURL}</link>
<language>es-AR</language>${newest ? `\n<lastBuildDate>${rssDate(newest)}</lastBuildDate>` : ''}
<atom:link href="${siteURL}/rss" rel="self" type="application/rss+xml"/>
${FEED_ONLY_ITEMS.filter((item) => Date.now() < new Date(item.until).getTime())
	.map(
		(item) => `<item>
<guid isPermaLink="false">${escapeXml(item.guid)}</guid>
<title>${escapeXml(item.title)}</title>
<link>${escapeXml(item.link)}</link>
<description>${escapeXml(item.description)}</description>${pubDate(item.date)}
</item>`
	)
	.join('')}${entries
		.map(
			(e) =>
				[
					'<item>',
					`<guid isPermaLink="true">${escapeXml(e.url)}</guid>`,
					`<title>${escapeXml(e.title)}</title>`,
					`<link>${escapeXml(e.url)}</link>`,
					`<description>${escapeXml(e.summary || e.title)}</description>`,
					...e.authors.map((name) => `<dc:creator>${escapeXml(name)}</dc:creator>`),
					...e.tags.map((tag) => `<category>${escapeXml(tag)}</category>`)
				].join('\n') + `${pubDate(e.published)}\n</item>`
		)
		.join('')}
</channel>
</rss>
`;
};

/**
 * El XML de /rss (+server.js): el RSS 2.0 de siempre (lo anuncia src/app.html). Los eventos y el material más nuevos, con
 * el mismo texto que los feeds Atom y JSON Feed (src/lib/utils/feeds.js): el resumen (del evento,
 * la fecha adelante, nunca el lugar), autores, etiquetas e idioma. Solo publicaciones listadas y
 * públicas (`sitePosts`), sin las que redirigen a otro sitio (docs/seo.md).
 */
import { escapeXml, feedEntry, rfc3339 } from '$lib/utils/feeds.js';
const siteURL = 'https://kinkyvibe.ar';
const siteTitle = 'Kinky Vibe';
const siteDescription =
	'Divulgación disidente, producción de eventos y talleres, gestión comunitaria y editorial. Información y encuentros cuir LGTBQIA+ kinky y de BDSM.';

/** Cuántos eventos y cuántos materiales lista el feed (los más nuevos de cada uno). */
export const RSS_EVENTS = 30;
export const RSS_MATERIAL = 20;

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
${entries
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

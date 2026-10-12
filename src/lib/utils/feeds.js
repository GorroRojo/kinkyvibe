/**
 * Feeds Atom (RFC 4287) y JSON Feed 1.1 de los eventos, el material y cada etiqueta:
 * /calendario/feed.atom, /material/feed.json, /wiki/<etiqueta>/feed.atom… (docs/seo.md). El RSS
 * de siempre (/rss) sigue igual.
 *
 * Funciones puras: reciben las publicaciones (las mismas que listan las páginas, ya filtradas por
 * quién las puede ver) y devuelven el texto del feed. Del evento va la fecha, nunca el lugar: así
 * no hay que repetir acá las reglas de privacidad de los lugares.
 */
import { argDateTimeLong, parseSiteDate } from './dates.js';
import { SITE_NAME, SITE_URL, absoluteUrl } from './jsonLd.js';

/** Cuántas publicaciones lista cada feed (las más nuevas), como /rss. */
export const FEED_LIMIT = 50;

/**
 * @typedef {{
 *   id: string, url: string, title: string, summary: string,
 *   published?: string, updated: string, authors: string[], tags: string[], image?: string
 * }} FeedEntry
 */

/**
 * @typedef {{
 *   title: string, description: string, homeUrl: string, feedUrl: string,
 *   entries: FeedEntry[], updated?: string
 * }} Feed
 */

/**
 * Una fecha en RFC 3339 (lo que piden Atom y JSON Feed), o nada si no se puede leer.
 * @param {unknown} d
 * @returns {string | undefined}
 */
export function rfc3339(d) {
	if (d === undefined || d === null || d === '') return undefined;
	const date = d instanceof Date ? d : parseSiteDate(/** @type {any} */ (d));
	return isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Escapa texto para XML (también para atributos) y saca los caracteres de control que XML 1.0 no
 * acepta (un feed inválido hace que los lectores muestren todo como nuevo).
 * @param {unknown} s
 */
export function escapeXml(s) {
	return (
		String(s ?? '')
			// eslint-disable-next-line no-control-regex -- justamente los saca
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&apos;')
	);
}

/** @param {unknown} v */
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);

/**
 * Una publicación como entrada de feed. Del evento, el resumen empieza con la fecha (y
 * «Cancelado» si lo está).
 * @param {ProcessedPost} post
 * @param {number} [now] para publicaciones sin ninguna fecha
 * @returns {FeedEntry}
 */
export function feedEntry(post, now = Date.now()) {
	const meta = /** @type {Record<string, any>} */ (post.meta ?? {});
	const url = absoluteUrl(post.path) ?? SITE_URL;
	const published = rfc3339(meta.published_date) ?? rfc3339(meta.start);
	const updated = rfc3339(meta.updated_date) ?? published ?? new Date(now).toISOString();
	let summary = typeof meta.summary === 'string' ? meta.summary.trim() : '';
	if (meta.category === 'calendario') {
		const when = argDateTimeLong(meta.start);
		const prefix = [meta.status === 'cancelado' ? 'Cancelado' : '', when]
			.filter(Boolean)
			.join(' · ');
		summary = [prefix, summary].filter(Boolean).join(' · ');
	}
	return {
		id: url,
		url,
		title: String(meta.title ?? post.path),
		summary,
		published,
		updated,
		authors: strings(meta.authors),
		tags: strings(meta.tags),
		image: absoluteUrl(meta.featured)
	};
}

/**
 * Las publicaciones de un feed: de esas categorías (y, si se pide, con alguna de esas
 * etiquetas), sin las que redirigen a otro sitio, de la más nueva a la más vieja.
 * @param {ProcessedPost[]} posts
 * @param {{ categories: string[], tags?: Set<string> | null, limit?: number }} opts
 */
export function feedPosts(posts, { categories, tags = null, limit = FEED_LIMIT }) {
	const time = (/** @type {ProcessedPost} */ p) =>
		new Date(rfc3339(p.meta.published_date) ?? rfc3339(p.meta.start) ?? 0).getTime();
	return posts
		.filter((p) => categories.includes(String(p.meta?.category)))
		.filter((p) => !p.meta.redirect)
		.filter((p) => !tags || strings(p.meta.tags).some((t) => tags.has(t)))
		.sort((a, b) => time(b) - time(a))
		.slice(0, limit);
}

/** La fecha del feed: la más nueva de sus entradas. @param {Feed} feed */
const feedUpdated = (feed) =>
	feed.updated ??
	feed.entries
		.map((e) => e.updated)
		.sort()
		.at(-1) ??
	new Date(0).toISOString();

/**
 * @param {Feed} feed
 * @returns {string}
 */
export function atomFeed(feed) {
	const entries = feed.entries
		.map((e) => {
			const lines = [
				'<entry>',
				`<id>${escapeXml(e.id)}</id>`,
				`<title>${escapeXml(e.title)}</title>`,
				`<link rel="alternate" type="text/html" href="${escapeXml(e.url)}"/>`,
				`<updated>${e.updated}</updated>`
			];
			if (e.published) lines.push(`<published>${e.published}</published>`);
			for (const name of e.authors) lines.push(`<author><name>${escapeXml(name)}</name></author>`);
			for (const tag of e.tags) lines.push(`<category term="${escapeXml(tag)}"/>`);
			if (e.summary) lines.push(`<summary>${escapeXml(e.summary)}</summary>`);
			lines.push('</entry>');
			return lines.join('\n');
		})
		.join('\n');
	return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="es">
<id>${escapeXml(feed.feedUrl)}</id>
<title>${escapeXml(feed.title)}</title>
<subtitle>${escapeXml(feed.description)}</subtitle>
<link rel="self" type="application/atom+xml" href="${escapeXml(feed.feedUrl)}"/>
<link rel="alternate" type="text/html" href="${escapeXml(feed.homeUrl)}"/>
<updated>${feedUpdated(feed)}</updated>
<author><name>${SITE_NAME}</name><uri>${SITE_URL}</uri></author>
<icon>${SITE_URL}/favicon-32x32.png</icon>
${entries}
</feed>
`;
}

/**
 * @param {Feed} feed
 * @returns {string}
 */
export function jsonFeed(feed) {
	return JSON.stringify(
		{
			version: 'https://jsonfeed.org/version/1.1',
			title: feed.title,
			home_page_url: feed.homeUrl,
			feed_url: feed.feedUrl,
			description: feed.description,
			icon: `${SITE_URL}/android-chrome-512x512.png`,
			favicon: `${SITE_URL}/favicon-32x32.png`,
			language: 'es',
			authors: [{ name: SITE_NAME, url: SITE_URL }],
			items: feed.entries.map((e) => ({
				id: e.id,
				url: e.url,
				title: e.title,
				content_text: e.summary || e.title,
				summary: e.summary || undefined,
				image: e.image,
				date_published: e.published,
				date_modified: e.updated,
				authors: e.authors.length ? e.authors.map((name) => ({ name })) : undefined,
				tags: e.tags.length ? e.tags : undefined
			}))
		},
		null,
		1
	);
}

/**
 * Las respuestas de los feeds Atom y JSON Feed (src/lib/utils/feeds.js arma el texto): de una
 * sección (eventos o material) o de una etiqueta con sus hijas, como su página de la wiki.
 */
import { error } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';
import { resolveTagSlug } from '$lib/utils/tagSlug.js';
import { atomFeed, feedEntry, feedPosts, jsonFeed } from '$lib/utils/feeds.js';
import { SITE_NAME, SITE_URL } from '$lib/utils/jsonLd.js';

/** @typedef {'atom' | 'json'} FeedFormat */

const FILES = /** @type {const} */ ({ atom: 'feed.atom', json: 'feed.json' });

export const SECTION_FEEDS = Object.freeze({
	calendario: {
		title: `Calendario · ${SITE_NAME}`,
		description: 'Eventos, talleres y encuentros kinky, BDSM y cuir.',
		categories: ['calendario']
	},
	material: {
		title: `Material · ${SITE_NAME}`,
		description: 'Artículos, links y descargables sobre BDSM, kink y sexualidades disidentes.',
		categories: ['material']
	}
});

/**
 * @param {import('$lib/utils/feeds.js').Feed} feed
 * @param {FeedFormat} format
 */
function respond(feed, format) {
	const body = format === 'atom' ? atomFeed(feed) : jsonFeed(feed);
	const type = format === 'atom' ? 'application/atom+xml' : 'application/feed+json';
	return new Response(body, {
		headers: { 'content-type': `${type}; charset=utf-8`, ...TAGGED_CACHE }
	});
}

/**
 * /calendario/feed.atom, /material/feed.json…
 * @param {App.Platform | undefined} platform
 * @param {keyof typeof SECTION_FEEDS} section
 * @param {FeedFormat} format
 */
export async function sectionFeed(platform, section, format) {
	const { title, description, categories } = SECTION_FEEDS[section];
	const now = Date.now();
	const posts = feedPosts(await sitePosts(platform), { categories });
	const homeUrl = `${SITE_URL}/${section}`;
	return respond(
		{
			title,
			description,
			homeUrl,
			feedUrl: `${homeUrl}/${FILES[format]}`,
			entries: posts.map((p) => feedEntry(p, now))
		},
		format
	);
}

/**
 * /wiki/<etiqueta>/feed.atom: los eventos y el material con esa etiqueta o una de sus hijas.
 * Etiqueta desconocida o sin nada, 404.
 * @param {App.Platform | undefined} platform
 * @param {string} term el segmento de la URL (ya decodificado)
 * @param {FeedFormat} format
 */
export async function tagFeed(platform, term, format) {
	const tags = await siteTagManager(platform);
	const tag = resolveTagSlug(tags, term);
	if (!tag) error(404, 'Not found');
	const wanted = new Set([tag.id, ...(tag.getAllChildren?.() ?? [])]);
	const posts = feedPosts(await sitePosts(platform), {
		categories: ['calendario', 'material'],
		tags: wanted
	});
	if (!posts.length) error(404, 'Not found');
	const name = tag.visible_name ?? tag.id;
	const homeUrl = `${SITE_URL}/wiki/${encodeURIComponent(term)}`;
	const now = Date.now();
	return respond(
		{
			title: `${name} · ${SITE_NAME}`,
			description: `Eventos y material de ${SITE_NAME} con la etiqueta «${name}».`,
			homeUrl,
			feedUrl: `${homeUrl}/${FILES[format]}`,
			entries: posts.map((p) => feedEntry(p, now))
		},
		format
	);
}

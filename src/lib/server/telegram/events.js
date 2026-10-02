/**
 * De dónde saca el bot los eventos (decisión 0029). Es el ÚNICO lugar que sabe cómo se leen:
 * hoy de los `.md` con `fetchMarkdownPosts`; cuando `contenido_db` (#166) esté en `main`, se
 * cambia por `sitePosts(platform)` de `$lib/server/contenido/posts.js` (devuelve el mismo
 * `ProcessedPost`, de la base o de los `.md` según el interruptor). El resto del bot no cambia.
 *
 * Solo salen eventos públicos: nada oculto ni no listado (`fetchMarkdownPosts` ya los saca) y
 * nada que ya empezó. No se arman consultas propias ni se muestran lugares.
 */
import { fetchMarkdownPosts } from '$lib/utils';

/** @typedef {import('./format.js').BotEvent} BotEvent */

/**
 * @param {ProcessedPost[]} posts
 * @param {number} now
 * @returns {BotEvent[]}
 */
export function toUpcomingEvents(posts, now) {
	return posts
		.filter((p) => p.meta?.category === 'calendario' && p.meta?.postID)
		.filter((p) => new Date(p.meta.start).getTime() > now)
		.sort((a, b) => new Date(a.meta.start).getTime() - new Date(b.meta.start).getTime())
		.map((p) => ({
			slug: String(p.meta.postID),
			title: String(p.meta.title ?? p.meta.postID),
			start: String(p.meta.start),
			...(p.meta.end ? { end: String(p.meta.end) } : {})
		}));
}

/**
 * Los próximos eventos, del más cercano al más lejano.
 *
 * @param {App.Platform | undefined} [_platform] lo va a usar `sitePosts` cuando llegue #166
 * @param {number} [now]
 */
export async function listUpcomingEvents(_platform, now = Date.now()) {
	return toUpcomingEvents(await fetchMarkdownPosts(), now);
}

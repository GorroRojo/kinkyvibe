/**
 * De dónde saca el bot los eventos (decisión 0029). Es el ÚNICO lugar que sabe cómo se leen:
 * con `sitePosts(platform)` de `$lib/server/contenido/posts.js`, la capa compartida de contenido
 * (devuelve el mismo `ProcessedPost` de la base o de los `.md`, según el interruptor
 * `contenido_db`). El resto del bot no sabe de dónde vienen.
 *
 * Solo salen eventos públicos: nada oculto ni no listado (`sitePosts` sin `unlisted` da solo lo
 * listado y, con la base, lo que ve cualquiera sin cuenta) y nada que ya empezó. No se arman
 * consultas propias ni se muestran lugares.
 */
import { sitePosts } from '$lib/server/contenido/posts.js';

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
 * @param {App.Platform | undefined} platform
 * @param {number} [now]
 */
export async function listUpcomingEvents(platform, now = Date.now()) {
	return toUpcomingEvents(await sitePosts(platform), now);
}

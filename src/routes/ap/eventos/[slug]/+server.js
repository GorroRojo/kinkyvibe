/**
 * Un evento como objeto `Event` de ActivityPub (prototipo, interruptor `fediverso`): la dirección
 * `id` de los eventos del outbox. Solo eventos listados (los mismos que el calendario), con el
 * lugar como en /calendario.ics. Apagado, o un evento que no está, 404.
 */
import { error } from '@sveltejs/kit';
import { fediversoEnabled } from '$lib/server/flags.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { feedVenues } from '$lib/server/amigues/venues.js';
import { apJson, eventObject } from '$lib/utils/activitypub.js';
import { parseSiteDate } from '$lib/utils/dates.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform }) {
	if (!(await fediversoEnabled(platform))) error(404, 'Not found');
	const post = (await sitePosts(platform)).find(
		(p) =>
			p.meta.category === 'calendario' &&
			String(p.meta.postID) === params.slug &&
			!p.meta.redirect &&
			!isNaN(parseSiteDate(p.meta.start).getTime())
	);
	if (!post) error(404, 'Not found');
	const venues = await feedVenues(getDB(platform), [params.slug]);
	return apJson(eventObject(post, venues.get(params.slug)));
}

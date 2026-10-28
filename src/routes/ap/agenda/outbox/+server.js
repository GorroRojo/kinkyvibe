/**
 * El outbox de la agenda (prototipo, interruptor `fediverso`): los próximos eventos públicos como
 * `Create` de un `Event`. El lugar, como en /calendario.ics: `feedVenues` (lo que la página del
 * evento le muestra a cualquiera) y `feedLocation`. Apagado, 404.
 */
import { error } from '@sveltejs/kit';
import { fediversoEnabled } from '$lib/server/flags.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { feedVenues } from '$lib/server/amigues/venues.js';
import { apJson, isOutboxEvent, outboxCollection } from '$lib/utils/activitypub.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ platform }) {
	if (!(await fediversoEnabled(platform))) error(404, 'Not found');
	const now = Date.now();
	const events = (await sitePosts(platform)).filter((p) => isOutboxEvent(p, now));
	const venues = await feedVenues(
		getDB(platform),
		events.map((p) => String(p.meta.postID))
	);
	return apJson(outboxCollection(events, venues, now));
}

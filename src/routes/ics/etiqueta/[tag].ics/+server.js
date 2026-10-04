/**
 * GET /ics/etiqueta/<etiqueta>.ics: calendario para suscribirse a una etiqueta o serie (los
 * eventos listados con esa etiqueta o una de sus hijas, como su página). Interruptor `series`:
 * apagado, 404. Mismo armado que /calendario.ics ($lib/utils/icsFeed.js, que decide qué dirección
 * puede ir: ver `feedLocation`).
 */
import { error } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { buildIcsFeed, icsResponse } from '$lib/utils/icsFeed.js';
import { eventsForTag } from '$lib/server/series/index.js';
import { requireSeries } from '$lib/server/series/web.js';
import { resolveTagSlug } from '$lib/utils/series.js';
import { getDB } from '$lib/server/db';
import { feedVenues } from '$lib/server/amigues/venues.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform }) {
	await requireSeries(platform);
	// «Rancheadita-Kinky», «Rancheadita Kinky» o un alias: la misma etiqueta (como /wiki/<término>).
	const tags = await siteTagManager(platform);
	const tag = resolveTagSlug(tags, params.tag);
	const id = tag?.id ?? params.tag;
	const posts = await sitePosts(platform);
	const events = await eventsForTag(id, { posts, tags });
	if (!events.length) error(404, 'Not found');
	const name = tag?.visible_name ?? id;
	// La privacidad de los lugares (#137) manda sobre `location` del .md, como en la página.
	const venues = await feedVenues(
		getDB(platform),
		events.map((e) => String(e.meta.postID))
	);
	return icsResponse(
		buildIcsFeed(events, { calName: `${name} · Kinky Vibe`, profiles: posts, venues })
	);
}

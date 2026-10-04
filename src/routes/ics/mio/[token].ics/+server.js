/**
 * GET /ics/mio/<token>.ics: el calendario personal ("lo tuyo"): los eventos para los que la
 * cuenta tiene entradas y, con «Lo que sigo», lo que sigue y donde participa ($lib/server/sigo/calendar.js). El token es secreto y se puede revocar desde Mi rincón → Calendario
 * ($lib/server/series/feeds.js). Con un token que no existe o se revocó, 404.
 *
 * Incluye eventos no listados y los cancelados (como cancelados), porque son tuyos. Nunca más
 * datos que la página pública del evento: el mismo armado que /calendario.ics.
 */
import { error } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { getDB } from '$lib/server/db';
import { buildIcsFeed, icsResponse } from '$lib/utils/icsFeed.js';
import { accountForFeed } from '$lib/server/series/feeds.js';
import { calendarSlugs } from '$lib/server/sigo/calendar.js';
import { sigoEnabled } from '$lib/server/sigo/web.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';
import { feedVenues } from '$lib/server/amigues/venues.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform }) {
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	const accountId = await accountForFeed(db, params.token);
	if (!accountId) error(404, 'Not found');
	const [listed, unlisted] = await Promise.all([
		sitePosts(platform),
		sitePosts(platform, false, true)
	]);
	// Con «Lo que sigo» (interruptor `lo_que_sigo`): además, lo seguido y donde participo, y las
	// entradas se pueden sacar (docs/lo-que-sigo.md). Apagado, solo las entradas, como siempre.
	const slugs = await calendarSlugs(db, accountId, {
		listed,
		sigo: await sigoEnabled(platform),
		tags: await siteTagManager(platform)
	});
	const mine = [...listed, ...unlisted].filter((p) => slugs.has(String(p.meta.postID)));
	return icsResponse(
		buildIcsFeed(mine, {
			calName: 'Lo tuyo · Kinky Vibe',
			profiles: listed,
			includeCancelled: true,
			// Como la página pública del evento (#137): nunca más dirección que la que ve cualquiera.
			venues: await feedVenues(
				db,
				mine.map((p) => String(p.meta.postID))
			)
		}),
		{ private: true }
	);
}

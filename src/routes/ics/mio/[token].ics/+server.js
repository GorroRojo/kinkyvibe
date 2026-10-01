/**
 * GET /ics/mio/<token>.ics: el calendario personal ("lo tuyo"): los eventos para los que la
 * cuenta tiene entradas. El token es secreto y se puede revocar desde Mi rincón → Calendario
 * ($lib/server/series/feeds.js). Necesita los interruptores `series` y `cuentas`; apagados, o con
 * un token que no existe o se revocó, 404 (siempre el mismo, no dice cuál).
 *
 * Incluye eventos no listados y los cancelados (como cancelados), porque son tuyos. Nunca más
 * datos que la página pública del evento: el mismo armado que /calendario.ics.
 */
import { error } from '@sveltejs/kit';
import { fetchMarkdownPosts } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { cuentasEnabled } from '$lib/server/flags.js';
import { buildIcsFeed, icsResponse } from '$lib/utils/icsFeed.js';
import { accountForFeed, ticketedSlugs } from '$lib/server/series/feeds.js';
import { requireSeries } from '$lib/server/series/web.js';
import { feedVenues } from '$lib/server/amigues/venues.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform }) {
	await requireSeries(platform);
	if (!(await cuentasEnabled(platform))) error(404, 'Not found');
	const db = getDB(platform);
	if (!db) error(503, 'No disponible en este momento.');
	const accountId = await accountForFeed(db, params.token);
	if (!accountId) error(404, 'Not found');
	const slugs = await ticketedSlugs(db, accountId);
	const [listed, unlisted] = await Promise.all([
		fetchMarkdownPosts(),
		fetchMarkdownPosts(false, true)
	]);
	const mine = [...listed, ...unlisted].filter((p) => slugs.has(String(p.meta.postID)));
	return icsResponse(
		buildIcsFeed(mine, {
			calName: 'Lo tuyo · KinkyVibe',
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

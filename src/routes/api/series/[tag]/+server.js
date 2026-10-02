/**
 * GET /api/series/<etiqueta>: lo que la página de una etiqueta (/wiki/<etiqueta>, que puede estar
 * prerenderizada) muestra con el interruptor `series` prendido: si la etiqueta es una serie, su
 * imagen y sus ediciones (próximas primero, después las pasadas); si tiene eventos, el link de su
 * calendario .ics; y si hay una cuenta con sesión, si ya está suscripta a los avisos.
 *
 * Apagado: 404 (la página sigue como siempre). Sin datos de nadie: solo contenido público.
 */
import { error, json } from '@sveltejs/kit';
import { eventsForTag, seriesPage } from '$lib/server/series/index.js';
import { requireSeries, seriesAccountState } from '$lib/server/series/web.js';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { tagFeedPath, tagIdFromSlug } from '$lib/utils/series.js';
import { siteTagManager } from '$lib/server/etiquetas/source.js';

/** @type {import('./$types').RequestHandler} */
export async function GET({ params, platform, locals }) {
	await requireSeries(platform);
	// «Rancheadita-Kinky», «Rancheadita Kinky» o un alias: la misma etiqueta (como /wiki/<término>).
	// El árbol del archivo, o el de la base con el interruptor `etiquetas_db`.
	const tags = await siteTagManager(platform);
	const id = tagIdFromSlug(tags, params.tag) ?? params.tag;
	const posts = await sitePosts(platform);
	const [series, events] = await Promise.all([
		seriesPage(id, { tags, posts }),
		eventsForTag(id, { tags, posts })
	]);
	if (!series && !events.length) error(404, 'Not found');
	const account = series
		? await seriesAccountState(platform, locals)
		: { member: false, subscribed: [] };
	return json(
		{
			series,
			feed: events.length ? tagFeedPath(id) : null,
			account: { member: account.member, subscribed: account.subscribed.includes(id) }
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
}

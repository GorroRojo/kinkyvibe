import { error, json } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';
import { getDB } from '$lib/server/db';
import { isCalendarMonth } from '$lib/utils/allPosts';
import { partLabelsOrNone, pastEventsOf } from '$lib/server/eventos/pasados.js';
import { withPartLabel } from '$lib/utils/partes.js';

// Los eventos que ya empezaron en un mes (?mes=yyyy-MM), para la grilla de /calendario cuando
// alguien va a ese mes (docs/seo.md): solo lo que usa la grilla, nunca el lugar
// ($lib/server/eventos/pasados.js).
export const prerender = false;

/** @type {import("./$types").RequestHandler} */
export async function GET({ platform, url }) {
	const month = url.searchParams.get('mes');
	if (!isCalendarMonth(month)) error(400, 'mes: yyyy-MM');
	const [posts, partLabels] = await Promise.all([
		sitePosts(platform),
		partLabelsOrNone(getDB(platform))
	]);
	const events = posts.filter((p) => p.meta.layout == 'calendario');
	return json(
		pastEventsOf(events, month).map((p) => withPartLabel(p, partLabels)),
		{ headers: TAGGED_CACHE }
	);
}

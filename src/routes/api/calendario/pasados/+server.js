import { error, json } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';
import { getDB } from '$lib/server/db';
import { withVenuePlaces } from '$lib/server/amigues/venues.js';
import { isCalendarMonth } from '$lib/utils/allPosts';
import { fullPastEventsOf, partLabelsOrNone, pastEventsOf } from '$lib/server/eventos/pasados.js';
import { withPartLabel } from '$lib/utils/partes.js';

// Los eventos que ya empezaron en un mes (?mes=yyyy-MM, hora de Argentina), para /calendario
// (docs/seo.md):
// - sin más, para la grilla cuando alguien va a ese mes: solo lo que usa la grilla, nunca el lugar
//   ($lib/server/eventos/pasados.js);
// - con `enteros=1`, para la lista con «Mostrar eventos pasados»: enteros, con el lugar vinculado
//   como en /api/posts (antes la lista bajaba /api/posts entero, ~500 eventos).
export const prerender = false;

/** @type {import("./$types").RequestHandler} */
export async function GET({ platform, url }) {
	const month = url.searchParams.get('mes');
	if (!isCalendarMonth(month)) error(400, 'mes: yyyy-MM');
	const full = url.searchParams.get('enteros') === '1';
	const db = getDB(platform);
	const [posts, partLabels] = await Promise.all([sitePosts(platform), partLabelsOrNone(db)]);
	const events = posts.filter((p) => p.meta.layout == 'calendario');
	const past = full
		? // Un lugar vinculado manda sobre el «Dónde» del .md (como en /api/posts).
			await withVenuePlaces(db, fullPastEventsOf(events, month))
		: pastEventsOf(events, month);
	return json(
		past.map((p) => withPartLabel(p, partLabels)),
		{ headers: TAGGED_CACHE }
	);
}

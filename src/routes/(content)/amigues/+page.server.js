import { getDB } from '$lib/server/db';
import { KIND_FILTERS, amiguesListPosts } from '$lib/server/amigues/pages.js';
import { tagDescriptionsData } from '$lib/server/wiki/site.js';

/**
 * /amigues: los perfiles de la base (personas, proyectos y lugares), solo la base («solo base»:
 * las fichas .md ya no se leen; sin base no hay perfiles). El filtro `?tipo=` se aplica en la
 * página: este load no lee `url`, para no volver a correr con cada cambio de los filtros de
 * PostList. Ver docs/amigues.md.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ platform, locals, setHeaders }) {
	const db = getDB(platform);
	// La descripción de las etiquetas elegidas y su «Es más complejo».
	const descriptions = await tagDescriptionsData(platform);
	if (!db) return { posts: [], kinds: KIND_FILTERS, ...descriptions };
	// Lo que ve una cuenta o une admin puede incluir perfiles "solo con cuenta".
	if (locals.member || locals.user) setHeaders({ 'cache-control': 'private, no-store' });
	return { posts: await amiguesListPosts(db, locals), kinds: KIND_FILTERS, ...descriptions };
}

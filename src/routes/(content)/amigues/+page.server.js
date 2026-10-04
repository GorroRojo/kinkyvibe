import { fetchMarkdownPosts } from '$lib/utils';
import { getDB } from '$lib/server/db';
import { KIND_FILTERS, amiguesListPosts } from '$lib/server/amigues/pages.js';

/**
 * /amigues: los perfiles de la base (personas, proyectos y lugares; el interruptor
 * `perfiles_publicos` quedó prendido para siempre). Sin base, las fichas .md. El filtro `?tipo=` se
 * aplica en la página: este load no lee `url`, para no volver a correr con cada cambio de los
 * filtros de PostList. Ver docs/amigues.md.
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ platform, locals, setHeaders }) {
	const db = getDB(platform);
	if (db) {
		// Lo que ve una cuenta o une admin puede incluir perfiles "solo con cuenta".
		if (locals.member || locals.user) setHeaders({ 'cache-control': 'private, no-store' });
		return { posts: await amiguesListPosts(db, locals), kinds: KIND_FILTERS };
	}
	const posts = await fetchMarkdownPosts();
	return { posts: posts.filter((p) => p.meta.layout == 'amigues'), kinds: null };
}

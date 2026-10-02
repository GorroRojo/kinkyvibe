import { sitePosts } from '$lib/server/contenido/posts.js';
import { buildIcsFeed } from '$lib/utils/icsFeed.js';

// Dinámico (antes se prerenderizaba): con el interruptor `contenido_db` prendido los eventos salen
// de la base y pueden cambiar sin un deploy. Apagado, da lo mismo que el archivo de siempre.

/** @type {import('./$types').RequestHandler} */
export async function GET({ platform }) {
	const allPosts = await sitePosts(platform);
	return new Response(buildIcsFeed(allPosts), {
		headers: { 'Content-Type': 'text/calendar', 'Cache-Control': 'public, max-age=300' }
	});
}

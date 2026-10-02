import { json } from '@sveltejs/kit';
import { sitePosts } from '$lib/server/contenido/posts.js';
import { TAGGED_CACHE } from '$lib/server/etiquetas/cache.js';

// Not prerendered: with the `contenido_db` switch on the events come from the database and can
// change without a deploy, and the posts' tags follow the `etiquetas_db` switch
// (docs/etiquetas.md); the database can't be read at build time.
export const prerender = false;

/** @type {import("./$types").RequestHandler} */
export async function GET({ platform }) {
	return json(await sitePosts(platform), { headers: TAGGED_CACHE });
}

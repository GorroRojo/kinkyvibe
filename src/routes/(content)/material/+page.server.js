import { sitePosts } from '$lib/server/contenido/posts.js';

/**
 * /material: las publicaciones de material listadas, por la capa compartida de contenido (de la
 * base o de los `.md`, según el interruptor `contenido_db`).
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ platform }) {
	const posts = await sitePosts(platform);
	return { posts: posts.filter((p) => p.meta.layout == 'material') };
}

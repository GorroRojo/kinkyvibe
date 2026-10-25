import { sitePosts } from '$lib/server/contenido/posts.js';
import { tagDescriptionsData } from '$lib/server/wiki/site.js';

/**
 * /material: las publicaciones de material listadas, por la capa compartida de contenido (de la
 * base).
 *
 * @type {import("./$types").PageServerLoad}
 */
export async function load({ platform }) {
	const [posts, descriptions] = await Promise.all([
		sitePosts(platform),
		// La descripción de las etiquetas elegidas y su «Es más complejo».
		tagDescriptionsData(platform)
	]);
	return { posts: posts.filter((p) => p.meta.layout == 'material'), ...descriptions };
}

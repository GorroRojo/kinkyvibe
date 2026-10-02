import { currentSitePosts } from '$lib/server/contenido/posts.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ platform }) {
	return { posts: await currentSitePosts(platform) };
}

import { fetchCurrentPosts } from '$lib/utils';

/** @type {import("./$types").PageServerLoad} */
export async function load() {
	return { posts: await fetchCurrentPosts() };
}

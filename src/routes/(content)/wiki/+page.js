import { fetchGlossary, fetchMarkdownPosts } from '$lib/utils';

/** @type {import("./$types").PageLoad} */
export async function load() {
	return {
		glosario: await fetchGlossary(),
		entries: await fetchMarkdownPosts(true)
	};
}

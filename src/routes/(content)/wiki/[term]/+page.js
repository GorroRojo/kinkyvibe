import { fetchPost } from '$lib/utils/index.js';
import tagsFactory from '$lib/utils/tags';
export const prerender = 'auto';
/** @type {import("./$types").PageLoad} */
export async function load({ params }) {
	let post;
	let tagManager = tagsFactory();
	try {
		post = await fetchPost('wiki', params.term);
	} catch (e) {
		post = { tag: tagManager.get(params.term) };
	}
	return {
		...post
	};
}

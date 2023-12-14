import { fetchMarkdownPosts, fetchPost } from '$lib/utils/index.js';
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
		entries: await fetchMarkdownPosts(true),
		...post,
		relatedPosts: (await fetchMarkdownPosts()).filter((p) => {
			if (p.meta.tags.includes(params.term)) return true;
			let children = tagManager.get(params.term)?.getAllChildren() ?? [];
			for (const c of children) {
				if (p.meta.tags.includes(c)) return true;
			}
			return false;
		})
	};
}

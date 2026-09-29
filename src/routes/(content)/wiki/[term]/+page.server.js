import { currentRelated, fetchMarkdownPosts, fetchPost } from '$lib/utils';
import tagsFactory from '$lib/utils/tags';

const tagManager = tagsFactory();

/** @type {import("./$types").PageServerLoad} */
export async function load({ params }) {
	let term = '';
	/** @type {string[]} */
	let children = [];
	try {
		const wiki = (await fetchPost('wiki', params.term, true)).meta.wiki;
		term = wiki ?? '';
		children = tagManager.get(wiki ?? '')?.getAllChildren() ?? [];
	} catch (e) {
		// no wiki entry: the page falls back to the tag of the same name
		term = tagManager.get(params.term)?.id ?? '';
	}
	const posts = await fetchMarkdownPosts();
	return currentRelated(
		posts.filter((p) => p.meta.tags.includes(term) || children.some((c) => p.meta.tags.includes(c)))
	);
}

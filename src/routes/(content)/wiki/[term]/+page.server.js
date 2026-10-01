import { currentRelated, fetchMarkdownPosts, fetchPost } from '$lib/utils';
import tagsFactory from '$lib/utils/tags';
import { tagIdFromSlug } from '$lib/utils/tagSlug.js';

const tagManager = tagsFactory();

/** @type {import("./$types").PageServerLoad} */
export async function load({ params }) {
	let term = '';
	/** @type {string[]} */
	let children = [];
	/** @type {Omit<ProcessedPost, 'content'>|{}} */
	let post = {};
	try {
		// The content component can't be serialized, so +page.js loads it on its own.
		// eslint-disable-next-line no-unused-vars
		const { content, ...rest } = await fetchPost('wiki', params.term);
		post = rest;
		const wiki = rest.meta.wiki;
		term = wiki ?? '';
		children = tagManager.get(wiki ?? '')?.getAllChildren() ?? [];
	} catch (e) {
		// no wiki entry: the page falls back to the tag of the same name (see +page.js), resolved
		// from the URL form ("Rancheadita-Kinky", aliases) like every other tag route.
		term = tagIdFromSlug(tagManager, params.term) ?? params.term;
	}
	const posts = await fetchMarkdownPosts();
	return {
		...post,
		...currentRelated(
			posts.filter(
				(p) => p.meta.tags.includes(term) || children.some((c) => p.meta.tags.includes(c))
			)
		)
	};
}

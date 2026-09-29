import { fetchMarkdownPosts } from '$lib/utils';
import { isCurrent } from '$lib/utils/allPosts';

// all the calendar grid (and a collapsed past-events list) uses; the page loads
// the full posts if the viewer chooses to list past events
const PAST_EVENT_FIELDS = [
	'title',
	'start',
	'end',
	'tags',
	'featured',
	'status',
	'layout',
	'category',
	'postID',
	'redirect',
	'mark'
];

/**
 * @param {AnyPostData} meta
 * @returns {AnyPostData}
 */
const slimMeta = (meta) => {
	/** @type {Record<string, any>} */
	const m = meta;
	return /** @type {AnyPostData} */ (
		Object.fromEntries(PAST_EVENT_FIELDS.filter((k) => k in m).map((k) => [k, m[k]]))
	);
};

/** @type {import("./$types").PageServerLoad} */
export async function load() {
	const now = Date.now();
	const posts = (await fetchMarkdownPosts()).filter((p) => p.meta.layout == 'calendario');
	return {
		posts: posts.map((p) =>
			isCurrent(p, now) ? p : /** @type {ProcessedPost} */ ({ ...p, meta: slimMeta(p.meta) })
		)
	};
}

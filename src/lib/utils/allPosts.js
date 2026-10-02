// Kept apart from $lib/utils/index.js so list pages can import it without
// pulling in that module's lookup tables for every post and image.
import '$lib/types.d.js';

/**
 * false for calendar events that already started (PostList hides them unless
 * "show past events" is on), true for everything else.
 * @param {ProcessedPost} post
 * @param {number} [now]
 */
export const isCurrent = (post, now = Date.now()) =>
	post.meta.category != 'calendario' || new Date(post.meta.start).getTime() > now;

/** @type {Promise<ProcessedPost[]>|undefined} */
let allPosts;
/**
 * Browser only: every listed post, including past events, from /api/posts (server-rendered and
 * cached a few minutes: its tags follow the `etiquetas_db` switch). Pages call this once the
 * viewer turns on "show past events".
 * @return {Promise<ProcessedPost[]>}
 */
export const fetchAllPostsClient = () =>
	(allPosts ??= fetch('/api/posts')
		.then((r) => {
			if (!r.ok) throw new Error('Could not load /api/posts: ' + r.status);
			return r.json();
		})
		.catch((e) => {
			allPosts = undefined;
			throw e;
		}));

/**
 * Posts shown under "Más cosas de…" on calendario/material/amigues pages.
 * @param {AnyPostData} meta - metadata of the post being viewed
 * @param {ProcessedPost[]} posts
 * @return {ProcessedPost[]}
 */
export const relatedPostsFor = (meta, posts) =>
	posts.filter(
		(p) =>
			meta.authors?.some(
				(/**@type string */ a) => p.meta.authors.includes(a) && p.meta.title !== meta.title
			) ||
			(meta.wiki && p.meta.tags.includes(meta.wiki)) ||
			(meta.category == 'wiki' && p.meta.tags.includes(meta.postID)) ||
			(meta.category == 'amigues' &&
				p.meta.authors.includes(meta.postID) &&
				p.meta.postID != meta.postID)
	);

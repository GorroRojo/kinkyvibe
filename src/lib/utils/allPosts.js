// Kept apart from $lib/utils/index.js so list pages can import it without
// pulling in that module's lookup tables for every post and image.
import '$lib/types.d.js';
import { toArgentina } from './dates.js';

/**
 * false for calendar events that already started (PostList hides them unless
 * "show past events" is on), true for everything else.
 * @param {ProcessedPost} post
 * @param {number} [now]
 */
export const isCurrent = (post, now = Date.now()) =>
	post.meta.category != 'calendario' || new Date(post.meta.start).getTime() > now;

/**
 * true if some calendar event of `month` (yyyy-MM, Argentina time) already started: /calendario
 * only offers "Mostrar/Ocultar eventos pasados" when there is something to show or hide.
 * @param {ProcessedPost[]} posts
 * @param {string} month yyyy-MM
 * @param {number} [now]
 */
export function monthHasPastEvents(posts, month, now = Date.now()) {
	return posts.some((post) => {
		if (post.meta.category != 'calendario') return false;
		const start = new Date(post.meta.start);
		if (isNaN(start.getTime()) || start.getTime() > now) return false;
		const local = toArgentina(start);
		const m = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}`;
		return m == month;
	});
}

/** @type {Promise<ProcessedPost[]>|undefined} */
let allPosts;
/**
 * Browser only: every listed post, including past events, from /api/posts (server-rendered and
 * cached a few minutes: its tags come from the database). Pages call this once the
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

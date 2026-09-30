/**
 * Validated repo paths for posts edited through the GitHub API. Every path the editor sends to
 * GitHub is built here, from a known category and a strict post id, so a route param or form
 * field can only ever name a post file.
 */

/** Post folders under src/lib/posts (also the `[category=category]` route matcher). */
export const CATEGORIES = Object.freeze(['amigues', 'calendario', 'material', 'wiki']);

/**
 * Post file names: letters, digits, `.`, `_` and `-`, not starting with `.` or `-`, and no `..`.
 * Existing ids include dots and underscores (amigues profiles, `_post_template`).
 */
const POST_ID = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,199}$/;

/**
 * @param {unknown} category
 * @returns {category is string}
 */
export function isCategory(category) {
	return typeof category === 'string' && CATEGORIES.includes(category);
}

/**
 * @param {unknown} postID
 * @returns {postID is string}
 */
export function isPostID(postID) {
	return typeof postID === 'string' && POST_ID.test(postID) && !postID.includes('..');
}

/**
 * `src/lib/posts/<category>/<postID>.md`, or null when either part is not valid.
 * @param {unknown} category
 * @param {unknown} postID
 * @returns {string|null}
 */
export function postFilePath(category, postID) {
	if (!isCategory(category) || !isPostID(postID)) return null;
	return `src/lib/posts/${category}/${postID}.md`;
}

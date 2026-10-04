import { siteProfilePronouns } from '$lib/server/contenido/posts.js';

/**
 * Pronoun labels of every public profile (from the database: «solo base», the amigues .md files
 * are not read any more), by its /amigues address, for the @mentions in a post's content (see
 * addMentionPronouns). Small (a few dozen entries), so pages get the whole map instead of the
 * client looking each mentioned profile up. It comes from the lists the site already remembers
 * (`sitePosts`): no extra reads. Without a database, nothing.
 * @param {App.Platform | undefined} platform
 * @param {readonly ProcessedPost[]} [posts] what `sitePosts` gave this request, if the page has
 *   it (then not even the «did anything change?» query is repeated)
 * @returns {Promise<Record<string, string>>}
 */
export async function mentionPronouns(platform, posts) {
	return { ...(await siteProfilePronouns(platform, posts)) };
}

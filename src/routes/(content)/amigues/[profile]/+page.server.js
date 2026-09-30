import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { mentionPronouns } from '$lib/server/pronouns';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params }) {
	// 404s for missing/unpublished profiles. The content component can't be serialized,
	// so +page.js loads it on its own.
	// eslint-disable-next-line no-unused-vars
	const { content, ...post } = await fetchPost('amigues', params.profile);
	return {
		...post,
		...currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts())),
		pronouns: await mentionPronouns()
	};
}

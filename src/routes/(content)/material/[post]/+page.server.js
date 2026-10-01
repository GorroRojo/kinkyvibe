import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { mentionPronouns } from '$lib/server/pronouns';
import { redirect } from '@sveltejs/kit';
import { personasForPage } from '$lib/server/personas/index.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform }) {
	// 404s for missing/unpublished posts. The content component can't be serialized,
	// so +page.js loads it on its own.
	// eslint-disable-next-line no-unused-vars
	const { content, ...post } = await fetchPost('material', params.post);
	if (post.meta?.redirect) {
		redirect(307, post.meta.link);
	}
	return {
		...post,
		...currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts())),
		pronouns: await mentionPronouns(),
		// Personas con su rol (interruptor `personas_eventos`; apagado, `null`).
		personas: await personasForPage(platform, post.meta)
	};
}

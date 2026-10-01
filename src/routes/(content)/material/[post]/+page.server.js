import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { mentionPronouns } from '$lib/server/pronouns';
import { propinasEnabled } from '$lib/server/flags.js';
import { isKinkyVibePost } from '$lib/utils/propinas.js';
import { redirect } from '@sveltejs/kit';

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
		// Interruptor `propinas`: bloque de propina en lugar de la nota del cafecito.
		propinas: isKinkyVibePost(post.meta) ? await propinasEnabled(platform) : false
	};
}

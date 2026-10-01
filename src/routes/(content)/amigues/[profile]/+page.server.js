import { currentRelated, fetchMarkdownPosts, fetchPost, relatedPostsFor } from '$lib/utils';
import { mentionPronouns } from '$lib/server/pronouns';
import { contentForProfilePage } from '$lib/server/personas/index.js';

/** @type {import("./$types").PageServerLoad} */
export async function load({ params, platform }) {
	// 404s for missing/unpublished profiles. The content component can't be serialized,
	// so +page.js loads it on its own.
	// eslint-disable-next-line no-unused-vars
	const { content, ...post } = await fetchPost('amigues', params.profile);
	return {
		...post,
		...currentRelated(relatedPostsFor(post.meta, await fetchMarkdownPosts())),
		pronouns: await mentionPronouns(),
		// Eventos y publicaciones que nombran al perfil con esta dirección, por rol (interruptor
		// `personas_eventos`, solo si el perfil es público; si no, `null`).
		participa: await contentForProfilePage(platform, params.profile, async () => [
			...(await fetchMarkdownPosts()),
			...(await fetchMarkdownPosts(true))
		])
	};
}

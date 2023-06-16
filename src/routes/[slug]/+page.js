import { thumbURL, aliaserFactory, fetchTags } from '$lib/utils/index.js';
export const prerender = 'auto';
export async function load({ params }) {
	try {
		const post = await import(`../../lib/posts/${params.slug}.md`);
		const content = post.default;
		const tagsConfig = await fetchTags();
		const alias = aliaserFactory(tagsConfig);
		return {
			content,
			...post.metadata,
			featured: thumbURL(params.slug, post.metadata.featured),
			tags: post.metadata.tags.map(alias)
		};
	} catch (e) {
		return { content: e + '\nparams.slug: ' + params.slug, title: 'Error', date: '', error: true };
	}
}

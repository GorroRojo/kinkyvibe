//@ts-nocheck
import { thumbURL } from '$lib/utils/index.js';
export const prerender = 'auto';
export async function load({ params }) {
	try {
		const post = await import(`../../lib/posts/${params.slug}.md`);
		const content = post.default;

		return {
			content,
			...post.metadata,
			featured: thumbURL(params.slug, post.metadata.featured)
		};
		
	} catch (e) {
		return { content: e + '\nparams.slug: ' + params.slug, title: 'Error', date: '', error: true };
	}
}

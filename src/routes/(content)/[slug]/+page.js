import {
	thumbURL,
	fetchMarkdownPosts,
	processMetadata,
	fetchTags,
	aliaserFactory
} from '$lib/utils/index.js';
import { redirect } from '@sveltejs/kit';
export const prerender = 'auto';
/** @type {import("./$types").PageLoad} */
export async function load({ params }) {
	if (params.slug == 'kinkipedia') throw redirect(308, '/wiki');
	/** @type {{metadata: AnyPostData, default: *}} */
	let post;
	try {
		post = await import(`../../../lib/posts/${params.slug}.md`);
	} catch (e) {
		return { content: e + '\nparams.slug: ' + params.slug, title: 'Error', date: '', error: true };
	}
	const content = post.default;
	if (post.metadata.category == 'material' && post.metadata.link && post.metadata.redirect) {
		throw redirect(308, post.metadata.link);
	}
	try {
		const authorsData = await Promise.all(
			(await Promise.all(
				post.metadata.authors.map(async (/** @type {any} */ author) => {
					let authorpost;
					try {
						if (author == "KinkyVibe") author = "nosotres";
						authorpost = await import(`../../../lib/posts/${author.replaceAll(' ', '-')}.md`);
					} catch (e) {
						authorpost = false;
					}
					return [author.replaceAll(' ', '-'), authorpost];
				})
			))
		
			// eslint-disable-next-line no-unused-vars
			.filter(([_, data]) => data)
			.map(async ([author, authorpost]) => {
				return {
					...authorpost.metadata,
					logo: await thumbURL(author, authorpost.metadata.logo ?? authorpost.metadata.photo??authorpost.metadata.featured),
					tags: authorpost.metadata.tags,
					path: author
				};
			}));
		let posts;
		posts = (await fetchMarkdownPosts()).filter((p) =>
			post.metadata.authors.some((/** @type {any} */ a) => p.meta.authors.includes(a))
		);

		const tagsConfig = await fetchTags();
		const alias = aliaserFactory(tagsConfig);
		const { meta } = await processMetadata({ path: params.slug, meta: post.metadata }, alias, tagsConfig);
		return {
			content,
			...meta,
			authorsData,
			posts
		};
	} catch (e) {
		return { content: e + '\nparams.slug: ' + params.slug, title: 'Error', date: '', error: true };
	}
}

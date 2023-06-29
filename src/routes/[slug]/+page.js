import { thumbURL, aliaserFactory, fetchTags, fetchMarkdownPosts } from '$lib/utils/index.js';
export const prerender = 'auto';
/**
 *
 *
 * @export
 * @param {{params:*}} _
 * @return {Promise<*>}
 */
export async function load({ params }) {
	try {
		const post = await import(`../../lib/posts/${params.slug}.md`);
		const content = post.default;
		const tagsConfig = await fetchTags();
		const alias = aliaserFactory(tagsConfig);
		const authorsData = (
			await Promise.all(
				post.metadata.authors.map(async (/** @type {any} */ author) => {
					let authorpost;
					try {
						authorpost = await import(`../../lib/posts/${author.replaceAll(' ', '-')}.md`);
					} catch (e) {
						authorpost = false;
					}
					return [author.replaceAll(' ', '-'), authorpost];
				})
			)
		)
			// eslint-disable-next-line no-unused-vars
			.filter(([_, data]) => data)
			.map(
				(
					/** @type {[string,{ metadata: { logo: any; photo: any; tags: string[]; }; path: string; }]} */ [
						author,
						authorpost
					]
				) => {
					return {
						...authorpost.metadata,
						logo: thumbURL(author, authorpost.metadata.logo ?? authorpost.metadata.photo),
						tags: authorpost.metadata.tags.map(alias),
						path: author
					};
				}
			);
		let posts;
		if (post.metadata.category == 'amigues') {
			posts = (await fetchMarkdownPosts()).filter((p) =>
				post.metadata.authors.every((/** @type {any} */ a) => p.meta.authors.includes(a))
			);
		}
		console.log(posts)
		return {
			content,
			...post.metadata,
			featured: thumbURL(params.slug, post.metadata.featured),
			tags: post.metadata.tags.map(alias),
			authorsData,
			posts
		};
	} catch (e) {
		return { content: e + '\nparams.slug: ' + params.slug, title: 'Error', date: '', error: true };
	}
}

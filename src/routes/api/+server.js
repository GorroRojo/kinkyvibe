import { error, json } from '@sveltejs/kit';
import { fetchGlossary, fetchMarkdownPosts } from '$lib/utils';
import tagsFactory from '$lib/utils/tags.js';
export const prerender = true
export async function GET({ url }) {
	/**@type ProcessedPost[] */
	var allPosts;
	const params = url.searchParams;
	if (params.has('getTags')) {
		return json(await tagsFactory().entries());
	} else if (params.has('getGlossary')) {
		return json(await fetchGlossary());
	} else {
		try {
			allPosts = await fetchMarkdownPosts(params.has('wiki'));
		} catch (err) {
			// @ts-ignore
			throw error(400, err);
		}
		allPosts = allPosts.filter((p) => {
			let result = true;
			if (params.get('category')) {
				result = result && p.meta.category == params.get('category');
			}
			('..');
			if (params.has('tags')) {
				result =
					result &&
					(params
						?.get('tags')
						?.split(',')
						.map((t) => p.meta.tags.includes(t))
						.reduce((a, b) => a && b) ??
						false);
			}
			if (params.has('getAuthors')) {
				allPosts = allPosts.filter((p) => p.meta.logo || p.meta.photo);
			}
			return result;
		});
		const sortedPosts = allPosts.sort(
			(a, b) =>
				new Date(b.meta.published_date ?? '').getTime() -
				new Date(a.meta.published_date ?? '').getTime()
		);
		return json(sortedPosts);
	}
}

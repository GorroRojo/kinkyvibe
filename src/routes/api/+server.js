import { error, json } from '@sveltejs/kit';
import { fetchGlossary, fetchMarkdownPosts, fetchTags } from '$lib/utils';

export async function GET({ url }) {
	var allPosts;
	const params = url.searchParams;
	if (params.has('getTags')) {
		return json(await fetchTags());
	} else if (params.has('getGlossary')) {
		return json(await fetchGlossary());
	} else {
		try {
			allPosts = await fetchMarkdownPosts(params.has('wiki'));
		} catch (err) {
			throw error(400, err);
		}
		allPosts = allPosts.filter((p) => {
			let result = true;
			if (params.get('category')) {
				result &= p.meta.category == params.get('category');
			}
			('..');
			if (params.has('tags')) {
				result &= params
					.get('tags')
					.split(',')
					.map((t) => p.meta.tags.includes(t))
					.reduce((a, b) => a && b);
			}
			if (params.has('body')) {
				result &= p.default.render().html.includes(params.get('body'));
			}
			if (params.has('getAuthors')) {
				allPosts = allPosts.filter((p) => p.meta.logo || p.meta.photo);
			}
			return result;
		});
		const sortedPosts = allPosts.sort(
			(a, b) => new Date(b.meta.published_date) - new Date(a.meta.published_date)
		);
		return json(sortedPosts);
	}
}

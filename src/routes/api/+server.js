import { json } from '@sveltejs/kit';
import { fetchMarkdownPosts } from '$lib/utils';
export async function GET() {
	/**@type ProcessedPost[] */
	return json(await fetchMarkdownPosts());
}

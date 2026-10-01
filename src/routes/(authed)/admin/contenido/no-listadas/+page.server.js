import { fetchMarkdownPosts } from '$lib/utils';
import { requireAdmin } from '$lib/server/auth';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url }) {
	// Server loads run in parallel with the layout load, so guard here too.
	requireAdmin(locals, url);
	const unlisted_posts = await fetchMarkdownPosts(false, true);
	return {
		unlisted_posts
	};
}

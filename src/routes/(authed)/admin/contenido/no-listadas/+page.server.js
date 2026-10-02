import { sitePosts } from '$lib/server/contenido/posts.js';
import { requireAdmin } from '$lib/server/auth';

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, url, platform }) {
	// Server loads run in parallel with the layout load, so guard here too.
	requireAdmin(locals, url);
	// Con `contenido_db` prendido, los eventos no listados de la base.
	const unlisted_posts = await sitePosts(platform, false, true);
	return {
		unlisted_posts
	};
}
